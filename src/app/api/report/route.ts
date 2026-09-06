import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const url = new URL(req.url);
  const formId = url.searchParams.get("form_id"); // uuid หรือ "all"/ว่าง
  const from = url.searchParams.get("from"); // YYYY-MM-DD
  const to = url.searchParams.get("to");
  const result = url.searchParams.get("result"); // pass | fail | all
  const approval = url.searchParams.get("approval"); // none|pending|approved|rejected|all

  const supabase = await createClient();

  // ชื่อฟอร์ม (สำหรับหัวรายงาน) เมื่อเลือกฟอร์มเจาะจง
  let formTitle = "ทุกฟอร์ม";
  if (formId && formId !== "all") {
    const { data: f } = await supabase
      .from("forms").select("title").eq("id", formId).eq("tenant_id", session.tenantId).maybeSingle();
    formTitle = (f?.title as string) || "ฟอร์ม";
  }

  let q = supabase
    .from("submissions")
    .select("form_title, user_name, result, approval_status, fails, duration_s, submitted_at, id")
    .order("submitted_at", { ascending: false })
    .limit(10000);
  if (formId && formId !== "all") q = q.eq("form_id", formId);
  if (from) q = q.gte("submitted_at", from + "T00:00:00");
  if (to) q = q.lte("submitted_at", to + "T23:59:59");
  if (result === "pass" || result === "fail") q = q.eq("result", result);
  if (approval && approval !== "all") q = q.eq("approval_status", approval);

  const { data, error } = await q;
  if (error) return new Response(error.message, { status: 500 });

  const origin = url.origin;
  const wb = new ExcelJS.Workbook();
  wb.creator = "KROK";
  wb.created = new Date();
  const ws = wb.addWorksheet("รายงาน", { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = [
    { header: "วันที่ส่ง", key: "when", width: 20 },
    { header: "ฟอร์ม", key: "form", width: 26 },
    { header: "ผู้กรอก", key: "user", width: 20 },
    { header: "ผลลัพธ์", key: "result", width: 12 },
    { header: "สถานะอนุมัติ", key: "approval", width: 14 },
    { header: "จำนวนปัญหา", key: "failCount", width: 12 },
    { header: "รายการปัญหา", key: "fails", width: 40 },
    { header: "ใช้เวลา(วินาที)", key: "duration", width: 14 },
    { header: "ลิงก์เอกสาร", key: "link", width: 42 },
  ];

  // สไตล์หัวตาราง
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.alignment = { vertical: "middle" };
  head.height = 22;
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F6FE0" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });

  for (const s of data || []) {
    const fails = (s.fails as string[]) || [];
    let when = "";
    try {
      when = new Date(s.submitted_at as string).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
    } catch { /* ignore */ }
    const row = ws.addRow({
      when,
      form: s.form_title,
      user: s.user_name || "-",
      result: s.result === "fail" ? "ไม่ผ่าน" : "ผ่าน",
      approval: STATUS_TH[s.approval_status as string] || "-",
      failCount: fails.length,
      fails: fails.join(" | "),
      duration: s.duration_s ?? "",
      link: `${origin}/submission/${s.id}`,
    });
    // เน้นสีผลลัพธ์
    row.getCell("result").font = { color: { argb: s.result === "fail" ? "FFDC2626" : "FF15803D" }, bold: true };
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
