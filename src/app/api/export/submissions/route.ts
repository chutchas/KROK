import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_TH: Record<string, string> = {
  none: "-",
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ตีกลับ",
};

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // escape สำหรับ CSV: ครอบด้วย " และ escape " เป็น ""
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from"); // YYYY-MM-DD (optional)
  const to = url.searchParams.get("to");

  const supabase = await createClient();
  let q = supabase
    .from("submissions")
    .select("form_title, user_name, result, approval_status, fails, duration_s, submitted_at, id")
    .order("submitted_at", { ascending: false })
    .limit(5000);
  if (from) q = q.gte("submitted_at", from + "T00:00:00");
  if (to) q = q.lte("submitted_at", to + "T23:59:59");

  const { data, error } = await q;
  if (error) return new Response(error.message, { status: 500 });

  const origin = url.origin;
  const headers = ["วันที่ส่ง", "ฟอร์ม", "ผู้กรอก", "ผลลัพธ์", "สถานะอนุมัติ", "จำนวนปัญหา", "รายการปัญหา", "ใช้เวลา(วินาที)", "ลิงก์เอกสาร"];

  const lines = [headers.map(csvCell).join(",")];
  for (const s of data || []) {
    const fails = (s.fails as string[]) || [];
    let when = "";
    try {
      when = new Date(s.submitted_at as string).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
    } catch { /* ignore */ }
    lines.push(
      [
        when,
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
