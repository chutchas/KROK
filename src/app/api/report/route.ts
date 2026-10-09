import { isLateSync } from "@/lib/filled-at";
import { fmtCoords, mapUrl, readGeo } from "@/lib/geo";
import { rateLimited } from "@/lib/rate-limit";
import { canManage, getSession, hasMenu } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import ExcelJS from "exceljs";
import { tableCodeKey, type AnswerItem } from "@/lib/answer-item";
import { answerCell, answersByKey, collectColumns, sheetName } from "@/lib/report-columns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const STATUS_TH: Record<string, string> = {
  none: "-",
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ตีกลับ",
};

// รายงาน submissions เป็นไฟล์ Excel (.xlsx) — กรองรายฟอร์ม/ช่วงเวลา/ผลลัพธ์/สถานะอนุมัติ
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("unauthorized", { status: 401 });
  if (!(await hasMenu(session, "reports"))) return new Response("forbidden", { status: 403 });
  // ไฟล์ใหญ่ใช้หน่วยความจำมาก — จำกัดความถี่ต่อผู้ใช้
  if (await rateLimited(`report:${session.userId}`, 10, 60)) return new Response("ดาวน์โหลดถี่เกินไป โปรดลองใหม่อีกสักครู่", { status: 429 });

  const url = new URL(req.url);
  const formId = url.searchParams.get("form_id"); // uuid หรือ "all"/ว่าง
  const from = url.searchParams.get("from"); // YYYY-MM-DD
  const to = url.searchParams.get("to");
  const result = url.searchParams.get("result"); // pass | fail | all
  const approval = url.searchParams.get("approval"); // none|pending|approved|rejected|all

  const supabase = await createClient();

  // ชื่อฟอร์ม (สำหรับหัวรายงาน) เมื่อเลือกฟอร์มเจาะจง
  // เลือกฟอร์มเดียว → ใส่คำตอบรายช่องด้วย (ทุกฟอร์มมีช่องไม่เหมือนกัน จึงมีแค่สรุป)
  const withAnswers = !!formId && formId !== "all";
  let formTitle = "ทุกฟอร์ม";
  if (formId && formId !== "all") {
    const { data: f } = await supabase
      .from("forms").select("title").eq("id", formId).eq("tenant_id", session.tenantId).maybeSingle();
    formTitle = (f?.title as string) || "ฟอร์ม";
  }

  // ดึงทีละหน้า (batch) จนครบทุกแถวที่ตรงเงื่อนไข — ไม่ตัดที่ 10k อีกต่อไป
  const PAGE = 1000;
  const MAX_ROWS = 100000; // เพดานกันหน่วยความจำล้น (ปรับได้)
  type Row = {
    form_title: string; user_name: string | null; result: "pass" | "fail";
    approval_status: string; fails: string[] | null; duration_s: number | null;
    submitted_at: string; filled_at?: string | null; geo?: unknown; id: string; answers?: AnswerItem[] | null;
  };
  const rows: Row[] = [];
  let selectCols: string = `form_title, user_name, result, approval_status, fails, duration_s, submitted_at, filled_at, geo, id${withAnswers ? ", answers" : ""}`;
  // keyset pagination (submitted_at, id) — offset ลึก ๆ ช้าลงเรื่อย ๆ เพราะ DB ต้องข้ามแถวก่อนหน้าทุกครั้ง
  let cursor: { at: string; id: string } | null = null;
  while (rows.length < MAX_ROWS) {
    let q = supabase
      .from("submissions")
      .select(selectCols)
      .eq("tenant_id", session.tenantId) // เฉพาะ workspace ที่เปิดอยู่ (RLS คืนทุก workspace ที่เป็นสมาชิก)
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false }) // ลำดับตายตัว — กันแถวเวลาเดียวกันซ้ำ/หายระหว่างหน้า
      .limit(PAGE);
    if (cursor) q = q.or(`submitted_at.lt."${cursor.at}",and(submitted_at.eq."${cursor.at}",id.lt.${cursor.id})`);
    // สมาชิกทั่วไป: รายงาน = ประวัติการส่งของตัวเอง (กรองที่แอปด้วย ไม่พึ่ง RLS อย่างเดียว)
    if (!canManage(session.role)) q = q.eq("submitted_by", session.userId);
    if (formId && formId !== "all") q = q.eq("form_id", formId);
    if (from) q = q.gte("submitted_at", from + "T00:00:00+07:00");
    if (to) q = q.lte("submitted_at", to + "T23:59:59.999+07:00");
    if (result === "pass" || result === "fail") q = q.eq("result", result);
    if (approval && approval !== "all") q = q.eq("approval_status", approval);

    const { data, error } = await q;
    // ยังไม่รัน 0059 (ไม่มี filled_at) → ดึงแบบเดิม
    if (error && /filled_at/.test(error.message) && selectCols.includes("filled_at")) { selectCols = selectCols.replace(", filled_at", ""); continue; }
    // ยังไม่รัน 0066 (ไม่มี geo) → ดึงแบบเดิม
    if (error && /geo/.test(error.message) && selectCols.includes(", geo")) { selectCols = selectCols.replace(", geo", ""); continue; }
    if (error) return new Response(error.message, { status: 500 });
    const batch = (data || []) as unknown as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break; // ครบแล้ว
    const last = batch[batch.length - 1];
    cursor = { at: last.submitted_at, id: last.id };
  }

  const origin = url.origin;
  const wb = new ExcelJS.Workbook();
  wb.creator = session.tenantName; // ไฟล์ของลูกค้า — ไม่ใส่ชื่อแพลตฟอร์ม
  wb.created = new Date();
  const ws = wb.addWorksheet("รายงาน", { views: [{ state: "frozen", ySplit: 1 }] });

  const baseCols = [
    { header: "วันที่ส่ง", key: "when", width: 20 },
    { header: "กรอกจริง (ออฟไลน์)", key: "filled", width: 20 },
    { header: "ฟอร์ม", key: "form", width: 26 },
    { header: "ผู้กรอก", key: "user", width: 20 },
    { header: "ผลลัพธ์", key: "result", width: 12 },
    { header: "สถานะอนุมัติ", key: "approval", width: 14 },
    { header: "จำนวนปัญหา", key: "failCount", width: 12 },
    { header: "รายการปัญหา", key: "fails", width: 40 },
    { header: "ใช้เวลา(วินาที)", key: "duration", width: 14 },
    // พิกัดตอนส่ง — มีคอลัมน์เมื่อมีใบที่เก็บพิกัด
    ...(rows.some((r) => readGeo(r.geo)) ? [{ header: "พิกัด (lat, lng)", key: "geo", width: 24 }, { header: "แผนที่", key: "geoUrl", width: 30 }] : []),
    { header: "ลิงก์เอกสาร", key: "link", width: 42 },
  ];
  ws.columns = baseCols;

  // ---- คำตอบรายช่อง (เฉพาะรายงานของฟอร์มเดียว) ----
  // คอลัมน์เดิม A–I คงตำแหน่งไว้ ต่อท้ายด้วยช่องของฟอร์ม
  const answerSets = withAnswers ? rows.map((r) => (Array.isArray(r.answers) ? r.answers : [])) : [];
  const { columns: ansCols, tables } = withAnswers ? collectColumns(answerSets) : { columns: [], tables: [] };
  const extraCols: { header: string; key: string; width: number }[] = [];
  ansCols.forEach((c, i) => {
    extraCols.push({ header: c.label, key: `a${i}`, width: c.type === "table" ? 10 : Math.min(40, Math.max(12, c.label.length + 4)) });
    if (c.hasCode) extraCols.push({ header: `${c.label} (รหัส)`, key: `a${i}_code`, width: 14 });
  });
  if (extraCols.length) ws.columns = [...baseCols, ...extraCols];

  // สไตล์หัวตาราง
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.alignment = { vertical: "middle" };
  head.height = 22;
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F6FE0" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });

  // คำตอบแยกตาม key ของแต่ละแถว — คำนวณครั้งเดียว ใช้ทั้งชีตหลักและชีตตาราง
  const keyed = withAnswers ? rows.map((s) => answersByKey(Array.isArray(s.answers) ? s.answers : [])) : [];

  for (const [ri0, s] of rows.entries()) {
    const fails = (s.fails as string[]) || [];
    let when = "";
    try {
      when = new Date(s.submitted_at as string).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });
    } catch { /* ignore */ }
    const extra: Record<string, string> = {};
    if (withAnswers) {
      const byKey = keyed[ri0];
      ansCols.forEach((c, i) => {
        const a = byKey.get(c.key);
        extra[`a${i}`] = answerCell(a);
        if (c.hasCode) extra[`a${i}_code`] = a?.code ?? "";
      });
    }
    const row = ws.addRow({
      ...extra,
      when,
      filled: isLateSync(s.filled_at, s.submitted_at)
        ? new Date(s.filled_at as string).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" })
        : "",
      form: s.form_title,
      user: s.user_name || "-",
      result: s.result === "fail" ? "ไม่ผ่าน" : "ผ่าน",
      approval: STATUS_TH[s.approval_status as string] || "-",
      failCount: fails.length,
      fails: fails.join(" | "),
      duration: s.duration_s ?? "",
      ...(() => { const g = readGeo(s.geo); return g ? { geo: fmtCoords(g), geoUrl: mapUrl(g) } : {}; })(),
      link: `${origin}/submission/${s.id}`,
    });
    // เน้นสีผลลัพธ์
    row.getCell("result").font = { color: { argb: s.result === "fail" ? "FFDC2626" : "FF15803D" }, bold: true };
  }

  // ---- ช่องแบบตาราง: ชีตละ 1 ตาราง · 1 แถวต่อ 1 แถวในตาราง ----
  const usedNames = new Set<string>(["รายงาน"]);
  for (const t of tables) {
    const tws = wb.addWorksheet(sheetName(t.label, usedNames), { views: [{ state: "frozen", ySplit: 1 }] });
    const cols: { header: string; key: string; width: number }[] = [
      { header: "วันที่ส่ง", key: "when", width: 20 },
      { header: "ผู้กรอก", key: "user", width: 20 },
      { header: "แถวที่", key: "no", width: 8 },
    ];
    t.columns.forEach((c, i) => {
      cols.push({ header: c.label, key: `c${i}`, width: Math.min(40, Math.max(12, c.label.length + 4)) });
      if (c.hasCode) cols.push({ header: `${c.label} (รหัส)`, key: `c${i}_code`, width: 14 });
    });
    cols.push({ header: "ลิงก์เอกสาร", key: "link", width: 42 });
    tws.columns = cols;
    const th = tws.getRow(1);
    th.font = { bold: true, color: { argb: "FFFFFFFF" } };
    th.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F6FE0" } }; });

    for (const [si, s] of rows.entries()) {
      const a = keyed[si]?.get(t.key);
      if (!a || !Array.isArray(a.rows) || a.rows.length === 0) continue;
      let when = "";
      try { when = new Date(s.submitted_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }); } catch { /* ignore */ }
      a.rows.forEach((r, ri) => {
        const rec: Record<string, string | number> = { when, user: s.user_name || "-", no: ri + 1, link: `${origin}/submission/${s.id}` };
        t.columns.forEach((c, i) => {
          rec[`c${i}`] = r?.[c.id] ?? "";
          if (c.hasCode) rec[`c${i}_code`] = r?.[tableCodeKey(c.id)] ?? "";
        });
        tws.addRow(rec);
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = formTitle.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40) || "report";
  const filename = `krok-${safe}-${stamp}.xlsx`;
  const asciiName = `krok-report-${stamp}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
