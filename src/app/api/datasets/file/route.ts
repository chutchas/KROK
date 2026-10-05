import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession, canManage } from "@/lib/session";
import { getTenantPlan } from "@/lib/quota";
import { createClient } from "@/lib/supabase/server";
import {
  DATASET_SELECT,
  MAX_DATASET_ROWS,
  MAX_IMPORT_BYTES,
  coerceCell,
  decodeText,
  parseCsv,
  rowToMeta,
  sanitizeColumns,
  slugKey,
  tableFromMatrix,
  type DatasetColumn,
  type DatasetRecord,
  type ParsedTable,
} from "@/lib/datasets";
import { logRun, writeRecords } from "@/lib/datasets-server";

export const runtime = "nodejs";

// ============================================================
// นำเข้า dataset จากไฟล์ CSV / Excel (.xlsx)
//   action=preview → อ่านไฟล์แล้วคืนหัวคอลัมน์ + ตัวอย่าง + การจับคู่กับคอลัมน์เดิม
//   action=import  → นำเข้าจริง (แทนที่ทั้งชุด หรืออัปเดตตาม key)
// parse ฝั่ง server เพื่อไม่ต้องส่ง exceljs ลงเบราว์เซอร์
// ============================================================

async function readTable(file: File, sheetName?: string): Promise<{ table: ParsedTable; sheets: string[] }> {
  const name = file.name.toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".xls")) throw new Error("ไฟล์ .xls รุ่นเก่าไม่รองรับ — บันทึกเป็น .xlsx หรือ .csv ก่อน");
  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const sheets = wb.worksheets.map((w) => w.name);
    const ws = (sheetName && wb.getWorksheet(sheetName)) || wb.worksheets[0];
    if (!ws) throw new Error("ไฟล์ไม่มีชีต");
    const matrix: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = Array.isArray(row.values) ? (row.values as unknown[]).slice(1) : [];
      matrix.push(vals);
    });
    return { table: tableFromMatrix(matrix), sheets };
  }
  // csv / tsv / txt
  return { table: tableFromMatrix(parseCsv(decodeText(buf))), sheets: [] };
}

/** จับคู่คอลัมน์จากไฟล์ กับคอลัมน์ที่ dataset มีอยู่แล้ว (ตาม label หรือ key) */
function matchColumns(fileCols: DatasetColumn[], existing: DatasetColumn[]): (string | null)[] {
  const norm = (s: string) => s.trim().toLowerCase();
  return fileCols.map((fc) => {
    const hit = existing.find((e) => norm(e.label) === norm(fc.label) || e.key === fc.key);
    return hit ? hit.key : null;
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: await sm("ไม่มีสิทธิ์") }, { status: 403 });

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_IMPORT_BYTES + 64 * 1024) return NextResponse.json({ error: await sm("ไฟล์ใหญ่เกิน 10MB") }, { status: 413 });

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: await sm("อ่านไฟล์ไม่ได้") }, { status: 400 });
  }
  const file = fd.get("file");
  const datasetId = String(fd.get("dataset_id") || "");
  const action = fd.get("action") === "import" ? "import" : "preview";
  if (!(file instanceof File)) return NextResponse.json({ error: await sm("ไม่พบไฟล์") }, { status: 400 });
  if (file.size > MAX_IMPORT_BYTES) return NextResponse.json({ error: await sm("ไฟล์ใหญ่เกิน 10MB") }, { status: 413 });

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("datasets")
    .select(DATASET_SELECT)
    .eq("id", datasetId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: await sm("ไม่พบถังข้อมูล") }, { status: 404 });
  const ds = rowToMeta(row as Record<string, unknown>);

  let parsed: { table: ParsedTable; sheets: string[] };
  try {
    parsed = await readTable(file, String(fd.get("sheet") || "") || undefined);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? await sm(e.message) : "อ่านไฟล์ไม่ได้" }, { status: 400 });
  }
  const { table } = parsed;
  if (table.columns.length === 0) return NextResponse.json({ error: await sm("ไม่พบหัวคอลัมน์ในแถวแรก") }, { status: 400 });

  const maxRows = Math.min((await getTenantPlan(session.tenantId)).maxDatasetRows, MAX_DATASET_ROWS);
  const mapping = ds.columns.length ? matchColumns(table.columns, ds.columns) : table.columns.map((c) => c.key);

  if (action === "preview") {
    return NextResponse.json({
      ok: true,
      sheets: parsed.sheets,
      columns: table.columns,
      mapping,
      total: table.totalRows,
      tooMany: table.totalRows > maxRows,
      sample: table.records.slice(0, 20),
    });
  }

  // ---------- import ----------
  if (table.totalRows > maxRows)
    return NextResponse.json({ error: `ไฟล์มี ${table.totalRows.toLocaleString()} แถว เกินที่แพ็กเกจรองรับ (สูงสุด ${maxRows.toLocaleString()} แถวต่อถัง)` }, { status: 400 });

  const mode = fd.get("mode") === "upsert" ? "upsert" : "replace";
  let columns: DatasetColumn[];
  let keyColumn = ds.keyColumn;
  // fileKey → datasetKey
  const pick = new Map<string, DatasetColumn>();

  if (ds.columns.length === 0) {
    // นำเข้าครั้งแรก: ใช้คอลัมน์ที่ผู้ใช้ยืนยัน (แก้ label/type ได้ key ต้องตรงกับไฟล์)
    let chosen: DatasetColumn[] = [];
    try {
      chosen = sanitizeColumns(JSON.parse(String(fd.get("columns") || "[]")));
    } catch { /* ใช้ค่าจากไฟล์ */ }
    const fileKeys = new Set(table.columns.map((c) => c.key));
    columns = (chosen.length ? chosen : table.columns).filter((c) => fileKeys.has(c.key));
    if (!columns.length) return NextResponse.json({ error: await sm("ไม่ได้เลือกคอลัมน์") }, { status: 400 });
    for (const c of columns) pick.set(c.key, c);
    const k = String(fd.get("key_column") || "");
    keyColumn = k && columns.some((c) => c.key === k) ? k : null;
  } else {
    columns = [...ds.columns];
    const used = new Set(columns.map((c) => c.key));
    const addNew = fd.get("add_new_columns") === "1";
    table.columns.forEach((fc, i) => {
      const target = mapping[i];
      if (target) pick.set(fc.key, columns.find((c) => c.key === target)!);
      else if (addNew && columns.length < 40) {
        const nc: DatasetColumn = { key: slugKey(fc.label, columns.length, used), label: fc.label, type: fc.type };
        columns.push(nc);
        pick.set(fc.key, nc);
      }
    });
    if (pick.size === 0) return NextResponse.json({ error: await sm("ไม่มีคอลัมน์ในไฟล์ที่ตรงกับข้อมูลเดิม") }, { status: 400 });
  }
  if (mode === "upsert" && !keyColumn) return NextResponse.json({ error: await sm("โหมดอัปเดตตาม key ต้องมีคอลัมน์ key") }, { status: 400 });
  if (mode === "upsert" && ![...pick.values()].some((c) => c.key === keyColumn))
    return NextResponse.json({ error: await sm("ไฟล์ไม่มีคอลัมน์ key ของชุดข้อมูลนี้ — อัปเดตตาม key ไม่ได้") }, { status: 400 });

  const records: DatasetRecord[] = table.records.map((r) => {
    const out: DatasetRecord = {};
    for (const [fileKey, col] of pick) out[col.key] = coerceCell(r[fileKey], col.type);
    return out;
  });

  // บันทึกนิยามคอลัมน์ก่อน (ถ้ามีการเปลี่ยน)
  const colsChanged = JSON.stringify(columns) !== JSON.stringify(ds.columns) || keyColumn !== ds.keyColumn;
  if (colsChanged) {
    const { error } = await supabase
      .from("datasets")
      .update({ columns, key_column: keyColumn, sync_mode: mode })
      .eq("id", ds.id)
      .eq("tenant_id", session.tenantId);
    if (error) return NextResponse.json({ error: await sm(dbError(error)) }, { status: 400 });
  }

  try {
    const res = await writeRecords(supabase, { id: ds.id, keyColumn }, records, mode);
    const imported = records.length - res.skipped;
    await logRun(supabase, { id: ds.id, tenantId: session.tenantId }, "file", "ok", imported, `${file.name} · ${imported} แถว (${mode === "replace" ? "แทนที่ทั้งชุด" : "อัปเดตตาม key"})${res.skipped ? ` · ข้าม ${res.skipped} แถวที่ไม่มี key` : ""}`, session.userId);
    return NextResponse.json({ ok: true, rows: res.rows, imported, skipped: res.skipped });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ";
    await logRun(supabase, { id: ds.id, tenantId: session.tenantId }, "file", "error", 0, `${file.name}: ${msg}`, session.userId);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
