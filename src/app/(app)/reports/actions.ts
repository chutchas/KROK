"use server";
import { dbError } from "@/lib/db-error";
import { getSession, hasMenu } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export interface ReportFilters {
  formId?: string; // uuid หรือ "all"
  from?: string;   // YYYY-MM-DD
  to?: string;
  result?: string; // pass | fail | all
  approval?: string; // none|pending|approved|rejected|all
}

export interface PreviewRow {
  id: string;
  when: string;
  form: string;
  icon: string;
  user: string;
  result: "pass" | "fail";
  approval: string;
  failCount: number;
}

const PREVIEW_LIMIT = 100;

// ดึงข้อมูลตัวอย่างก่อน export — คืน 100 แถวแรก + จำนวนทั้งหมดตามเงื่อนไข
export async function previewReport(
  f: ReportFilters
): Promise<{ rows: PreviewRow[]; total: number } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!(await hasMenu(session, "reports"))) return { error: "ไม่มีสิทธิ์ใช้เมนูรายงาน" };

  const supabase = await createClient();

  // นับทั้งหมดตามเงื่อนไข
  // กรองตาม workspace ที่เปิดอยู่ — RLS อย่างเดียวจะคืน submission ของทุก workspace ที่ผู้ใช้เป็นสมาชิก
  let cq = supabase.from("submissions").select("id", { count: "exact", head: true }).eq("tenant_id", session.tenantId);
  if (f.formId && f.formId !== "all") cq = cq.eq("form_id", f.formId);
  if (f.from) cq = cq.gte("submitted_at", f.from + "T00:00:00+07:00");
  if (f.to) cq = cq.lte("submitted_at", f.to + "T23:59:59.999+07:00");
  if (f.result === "pass" || f.result === "fail") cq = cq.eq("result", f.result);
  if (f.approval && f.approval !== "all") cq = cq.eq("approval_status", f.approval);
  const { count } = await cq;

  // ดึงตัวอย่าง 100 แถวแรก
  let q = supabase
    .from("submissions")
    .select("id, form_title, form_icon, user_name, result, approval_status, fails, submitted_at")
    .eq("tenant_id", session.tenantId)
    .order("submitted_at", { ascending: false })
    .limit(PREVIEW_LIMIT);
  if (f.formId && f.formId !== "all") q = q.eq("form_id", f.formId);
  if (f.from) q = q.gte("submitted_at", f.from + "T00:00:00+07:00");
  if (f.to) q = q.lte("submitted_at", f.to + "T23:59:59.999+07:00");
  if (f.result === "pass" || f.result === "fail") q = q.eq("result", f.result);
  if (f.approval && f.approval !== "all") q = q.eq("approval_status", f.approval);
  const { data, error } = await q;
  if (error) return { error: dbError(error) };

  const rows: PreviewRow[] = ((data || []) as Record<string, unknown>[]).map((s) => {
    return {
      id: s.id as string,
      // ส่ง ISO ไป ให้หน้าจอจัดรูปแบบตามภาษาที่เลือก (เวลาไทย)
      when: (s.submitted_at as string) || "",
      form: (s.form_title as string) || "-",
      icon: (s.form_icon as string) || "📋",
      user: (s.user_name as string) || "-",
      result: (s.result as "pass" | "fail") || "pass",
      approval: (s.approval_status as string) || "none",
      failCount: Array.isArray(s.fails) ? (s.fails as string[]).length : 0,
    };
  });

  return { rows, total: count ?? rows.length };
}
