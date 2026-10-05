import { isLateSync } from "@/lib/filled-at";
import { rateLimited } from "@/lib/rate-limit";
import { getSession, hasMenu } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_TH: Record<string, string> = {
  none: "-",
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ตีกลับ",
};

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // กัน CSV/formula injection: ค่าที่ขึ้นต้นด้วย = + - @ tab CR จะถูก Excel รันเป็นสูตร → เติม ' นำหน้า
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  // escape สำหรับ CSV: ครอบด้วย " และ escape " เป็น ""
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("unauthorized", { status: 401 });
  if (!(await hasMenu(session, "reports", "dashboard"))) return new Response("forbidden", { status: 403 });
  if (await rateLimited(`export:${session.userId}`, 10, 60)) return new Response("ดาวน์โหลดถี่เกินไป โปรดลองใหม่อีกสักครู่", { status: 429 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from"); // YYYY-MM-DD (optional)
  const to = url.searchParams.get("to");

  const supabase = await createClient();
  const query = (cols: string) => {
    let q = supabase
      .from("submissions")
      .select(cols)
      .eq("tenant_id", session.tenantId) // เฉพาะ workspace ที่เปิดอยู่ (RLS คืนทุก workspace ที่เป็นสมาชิก)
      .order("submitted_at", { ascending: false })
      .limit(5000);
    if (from) q = q.gte("submitted_at", from + "T00:00:00+07:00");
    if (to) q = q.lte("submitted_at", to + "T23:59:59.999+07:00");
    return q;
  };
  const base = "form_title, user_name, result, approval_status, fails, duration_s, submitted_at, id";
  let { data, error } = await query(`${base}, filled_at`);
  if (error && /filled_at/.test(error.message)) ({ data, error } = await query(base)); // ยังไม่รัน 0059
  if (error) return new Response(error.message, { status: 500 });

  const origin = url.origin;
  const headers = ["วันที่ส่ง", "กรอกจริง (ออฟไลน์)", "ฟอร์ม", "ผู้กรอก", "ผลลัพธ์", "สถานะอนุมัติ", "จำนวนปัญหา", "รายการปัญหา", "ใช้เวลา(วินาที)", "ลิงก์เอกสาร"];

  const lines = [headers.map(csvCell).join(",")];
  for (const s of (data || []) as unknown as Record<string, unknown>[]) {
    const fails = (s.fails as string[]) || [];
    let when = "";
    try {
      when = new Date(s.submitted_at as string).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });
    } catch { /* ignore */ }
    const filled = isLateSync(s.filled_at as string | null, s.submitted_at as string)
      ? new Date(s.filled_at as string).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" })
      : "";
    lines.push(
      [
        when,
        filled,
        s.form_title,
        s.user_name,
        s.result === "fail" ? "ไม่ผ่าน" : "ผ่าน",
        STATUS_TH[s.approval_status as string] || "-",
        fails.length,
        fails.join(" | "),
        s.duration_s ?? "",
        `${origin}/submission/${s.id}`,
      ].map(csvCell).join(",")
    );
  }

  // UTF-8 BOM เพื่อให้ Excel อ่านภาษาไทยถูกต้อง
  const body = "﻿" + lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="krok-submissions-${stamp}.csv"`,
    },
  });
}
