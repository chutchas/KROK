"use server";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { canManage, getSession, hasMenu } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export interface ReportFilters {
  formId?: string; // uuid หรือ "all"
  from?: string;   // YYYY-MM-DD
  to?: string;
  result?: string; // pass | fail | fail_open (ไม่ผ่าน·ยังไม่ปิดเรื่อง) | fail_closed (ไม่ผ่าน·ปิดแล้ว) | all
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
  /** ไม่ผ่านแต่ปิดเรื่องแล้ว (0080) */
  closed: boolean;
}

/** ตัวกรองผลการตรวจ — ใช้ทั้งนับและดึงแถว (และ export: /api/report) */
function byResult<Q extends { eq: (c: string, v: string) => Q; is: (c: string, v: null) => Q; not: (c: string, op: string, v: null) => Q }>(q: Q, result?: string): Q {
  if (result === "pass" || result === "fail") return q.eq("result", result);
  if (result === "fail_open") return q.eq("result", "fail").is("fail_closed_at", null);
  if (result === "fail_closed") return q.eq("result", "fail").not("fail_closed_at", "is", null);
  return q;
}

const PREVIEW_LIMIT = 100;

// ดึงข้อมูลตัวอย่างก่อน export — คืน 100 แถวแรก + จำนวนทั้งหมดตามเงื่อนไข
export async function previewReport(
  f: ReportFilters,
  /** แถวที่ข้ามไป (ปุ่ม "แสดงเพิ่ม") */
  offset = 0
): Promise<{ rows: PreviewRow[]; total: number } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!(await hasMenu(session, "reports"))) return { error: await sm("ไม่มีสิทธิ์ใช้เมนูรายงาน") };

  const supabase = await createClient();

  // นับทั้งหมดตามเงื่อนไข
  // กรองตาม workspace ที่เปิดอยู่ — RLS อย่างเดียวจะคืน submission ของทุก workspace ที่ผู้ใช้เป็นสมาชิก
  let cq = supabase.from("submissions").select("id", { count: "exact", head: true }).eq("tenant_id", session.tenantId);
  // สมาชิกทั่วไป: รายงาน = ประวัติการส่งของตัวเอง (กรองที่แอปด้วย ไม่พึ่ง RLS อย่างเดียว)
  const mineOnly = !canManage(session.role);
  if (mineOnly) cq = cq.eq("submitted_by", session.userId);
  if (f.formId && f.formId !== "all") cq = cq.eq("form_id", f.formId);
  if (f.from) cq = cq.gte("submitted_at", f.from + "T00:00:00+07:00");
  if (f.to) cq = cq.lte("submitted_at", f.to + "T23:59:59.999+07:00");
  cq = byResult(cq, f.result);
  if (f.approval && f.approval !== "all") cq = cq.eq("approval_status", f.approval);
  const { count, error: countErr } = await cq;
  if (countErr && /fail_closed_at/.test(countErr.message)) return { error: await sm("ระบบยังไม่พร้อมปิดเรื่อง (ผู้ดูแลต้องรัน migration 0080)") };

  // ดึงตัวอย่าง 100 แถวแรก · ยังไม่รัน 0080 = ไม่มีคอลัมน์ปิดเรื่อง → ดึงแบบเดิม
  const COLS = "id, form_title, form_icon, user_name, result, approval_status, fails, submitted_at";
  const build = (cols: string) => {
  let q = supabase
    .from("submissions")
    .select(cols)
    .eq("tenant_id", session.tenantId)
    .order("submitted_at", { ascending: false })
    .range(Math.max(0, Math.floor(offset)), Math.max(0, Math.floor(offset)) + PREVIEW_LIMIT - 1);
  if (mineOnly) q = q.eq("submitted_by", session.userId);
  if (f.formId && f.formId !== "all") q = q.eq("form_id", f.formId);
  if (f.from) q = q.gte("submitted_at", f.from + "T00:00:00+07:00");
  if (f.to) q = q.lte("submitted_at", f.to + "T23:59:59.999+07:00");
  q = byResult(q, f.result);
  if (f.approval && f.approval !== "all") q = q.eq("approval_status", f.approval);
  return q;
  };
  let { data, error } = await build(`${COLS}, fail_closed_at`);
  if (error && /fail_closed_at/.test(error.message) && f.result !== "fail_open" && f.result !== "fail_closed") ({ data, error } = await build(COLS));
  if (error) return { error: await sm(dbError(error)) };

  const rows: PreviewRow[] = ((data || []) as unknown as Record<string, unknown>[]).map((s) => {
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
      closed: s.result === "fail" && !!s.fail_closed_at,
    };
  });

  return { rows, total: count ?? rows.length };
}
