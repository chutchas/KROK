import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  DATASET_SELECT,
  MAX_DATASET_ROWS,
  MAX_IMPORT_BYTES,
  inferFieldPaths,
  columnsFromPaths,
  mapPushedRecord,
  rowToMeta,
  type DatasetRecord,
} from "@/lib/datasets";
import { hashPushKey, logRun, writeRecords } from "@/lib/datasets-server";

export const runtime = "nodejs";

// ============================================================
// API push: ระบบภายนอกส่งข้อมูลเข้า dataset
//
//   POST /api/v1/datasets/{id}/rows
//   Authorization: Bearer kds_xxxxxxxx
//   { "mode": "upsert" | "replace", "rows": [ {...}, ... ], "delete_keys": ["A001"] }
//
//   GET  /api/v1/datasets/{id}/rows   → นิยามคอลัมน์ + จำนวนแถว (ไว้ทดสอบ key)
//
// - ชื่อ property ของแต่ละแถวจับคู่กับ key ของคอลัมน์ หรือชื่อที่แสดงก็ได้
// - dataset ที่ยังไม่มีคอลัมน์: สร้างคอลัมน์ให้จาก payload แรก
// - replace ต้องส่งครบทั้งชุดในคำขอเดียว (≤ 20,000 แถว)
// ============================================================

type Admin = NonNullable<ReturnType<typeof getAdminClient>>;

async function authenticate(req: Request, id: string, admin: Admin) {
  const auth = req.headers.get("authorization") || "";
  const key = auth.replace(/^Bearer\s+/i, "").trim() || req.headers.get("x-api-key") || "";
  if (!/^kds_[A-Za-z0-9_-]{20,}$/.test(key)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: sec } = await admin
    .from("dataset_secrets")
    .select("dataset_id, tenant_id")
    .eq("dataset_id", id)
    .eq("push_key_hash", hashPushKey(key))
    .maybeSingle();
  if (!sec) return null;
  const { data: row } = await admin.from("datasets").select(`${DATASET_SELECT}, tenant_id`).eq("id", id).maybeSingle();
  if (!row) return null;
  return { ds: rowToMeta(row as Record<string, unknown>), tenantId: row.tenant_id as string };
}

async function rateLimited(admin: Admin, id: string): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("hit_rate_limit", { p_key: `dspush:${id}`, p_max: 60, p_window_seconds: 60 });
    return !error && data === false;
  } catch {
    return false;
  }
}

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "service unavailable" }, { status: 503 });
  const a = await authenticate(req, id, admin);
  if (!a) return unauthorized();
  return NextResponse.json({
    id: a.ds.id,
    name: a.ds.name,
    columns: a.ds.columns,
    key_column: a.ds.keyColumn,
    row_count: a.ds.rowCount,
    last_synced_at: a.ds.lastSyncedAt,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "service unavailable" }, { status: 503 });
  const a = await authenticate(req, id, admin);
  if (!a) return unauthorized();
  if (await rateLimited(admin, id)) return NextResponse.json({ error: await sm("rate limit — สูงสุด 60 ครั้ง/นาที") }, { status: 429 });

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_IMPORT_BYTES) return NextResponse.json({ error: await sm("payload ใหญ่เกิน 10MB") }, { status: 413 });

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_IMPORT_BYTES) return NextResponse.json({ error: await sm("payload ใหญ่เกิน 10MB") }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: await sm("body ต้องเป็น JSON") }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: await sm("body ต้องเป็น JSON object") }, { status: 400 });

  const rows = Array.isArray(body.rows) ? body.rows : [];
  const deleteKeys = Array.isArray(body.delete_keys) ? body.delete_keys.map(String).filter(Boolean).slice(0, 5000) : [];
  const mode = body.mode === "replace" ? "replace" : body.mode === "upsert" ? "upsert" : a.ds.syncMode;
  if (rows.length > MAX_DATASET_ROWS) return NextResponse.json({ error: `rows เกิน ${MAX_DATASET_ROWS} แถวต่อคำขอ` }, { status: 400 });
  if (!rows.length && !deleteKeys.length && mode !== "replace") return NextResponse.json({ error: await sm("ไม่มี rows หรือ delete_keys") }, { status: 400 });

  let { columns } = a.ds;
  let keyColumn = a.ds.keyColumn;

  // dataset ใหม่ที่ยังไม่มีคอลัมน์ → สร้างจาก payload แรก
  if (columns.length === 0 && rows.length) {
    const sug = columnsFromPaths(rows, inferFieldPaths(rows).filter((p) => !p.includes(".")));
    columns = sug.columns;
    const wantKey = typeof body.key_column === "string" ? body.key_column : "";
    keyColumn = columns.find((c) => c.key === wantKey || c.label === wantKey)?.key ?? null;
    const { error } = await admin.from("datasets").update({ columns, key_column: keyColumn }).eq("id", id);
    if (error) return NextResponse.json({ error: dbError(error) }, { status: 500 });
  }

  if ((mode === "upsert" || deleteKeys.length) && !keyColumn)
    return NextResponse.json({ error: await sm("dataset นี้ยังไม่มี key column — ใช้ mode=replace หรือกำหนด key ในหน้า KROK (หรือส่ง key_column มาในครั้งแรก)") }, { status: 400 });

  const records = rows.map((r) => mapPushedRecord(r, columns)).filter((r): r is DatasetRecord => r !== null);

  try {
    let deleted = 0;
    let skippedNoKey = 0;
    if (deleteKeys.length && mode === "upsert") {
      const { data, error } = await admin.rpc("dataset_delete_keys", { p_dataset: id, p_keys: deleteKeys });
      if (error) throw new Error(error.message);
      deleted = Number(data ?? 0);
    }
    let total = a.ds.rowCount;
    if (records.length || mode === "replace") {
      const res = await writeRecords(admin, { id, keyColumn }, records, mode);
      total = res.rows;
      skippedNoKey = res.skipped;
    } else {
      const { data } = await admin.from("datasets").select("row_count").eq("id", id).maybeSingle();
      total = Number(data?.row_count ?? total);
    }
    await logRun(admin, { id, tenantId: a.tenantId }, "push", "ok", records.length - skippedNoKey, `push ${records.length - skippedNoKey} แถว${skippedNoKey ? ` · ข้าม ${skippedNoKey} ที่ไม่มี key` : ""}${deleted ? ` · ลบ ${deleted}` : ""} (${mode})`);
    const written = records.length - skippedNoKey;
    return NextResponse.json({ ok: true, received: rows.length, written, skipped: rows.length - written, deleted, row_count: total });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ผิดพลาด";
    await logRun(admin, { id, tenantId: a.tenantId }, "push", "error", 0, msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
