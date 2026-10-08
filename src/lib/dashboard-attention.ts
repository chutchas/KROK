import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bkkDayStart } from "@/lib/schedule";
import { loadTodayRounds } from "@/lib/schedule-server";
import { sanitizeChain } from "@/lib/approval";

// ============================================================
// แถบ "ต้องดูตอนนี้" บนแดชบอร์ด — ใบไม่ผ่านวันนี้ · รอบตรวจเลยกำหนด · งานรออนุมัติ
// ใช้ client ของผู้ใช้ (RLS 0054 กรองฟอร์ม/ใบที่ไม่มีสิทธิ์เห็นให้แล้ว) · ทุกส่วนโหลดขนานกัน
// ส่วนไหนพลาด/ยังไม่รัน migration = null (ไม่แสดงส่วนนั้น) — ไม่ทำให้ทั้งหน้าพัง
// ============================================================

const LIST_N = 5;
/** เพดานแถวที่ดึงมากรองคิวอนุมัติ (เท่าหน้าอนุมัติ) */
const APPROVAL_CAP = 500;

export interface AttentionFailedItem {
  id: string;
  form_title: string;
  form_icon: string;
  user_name: string;
  submitted_at: string;
  fails: number;
}
export interface AttentionRoundItem { formId: string; title: string; icon: string; time: string; due: string }

export interface AttentionData {
  /** ใบที่ไม่ผ่านวันนี้ (เวลาไทย) */
  failedToday: { count: number; items: AttentionFailedItem[] } | null;
  /** รอบตรวจที่เลยกำหนด (ยังทำทัน) · null = ไม่มีตาราง/ยังไม่รัน 0064 */
  overdueRounds: { count: number; items: AttentionRoundItem[] } | null;
  /** ใบรออนุมัติที่ถึงคิวฉัน · null = ไม่ใช่ผู้อนุมัติ */
  approvals: { count: number; capped: boolean } | null;
}

export interface AttentionOpts {
  tenantId: string;
  userId: string;
  role: "owner" | "admin" | "designer" | "operator";
  /** ผู้จัดการ workspace (owner/admin/designer) */
  manager: boolean;
  /** มีเมนูอนุมัติ */
  canApprove: boolean;
  /** มีรอบตรวจตามตาราง (ไม่มี = ไม่ต้องโหลด) */
  hasSchedules: boolean;
  /** ฟอร์มที่ผู้ใช้เห็น (RLS แล้ว) — กรองรอบตรวจ */
  visibleFormIds: Promise<Set<string>>;
}

async function loadFailedToday(supabase: SupabaseClient, tenantId: string): Promise<AttentionData["failedToday"]> {
  // นับ + ดึง 5 ใบล่าสุดในคำขอเดียว · ใช้ index (tenant_id, submitted_at desc)
  const { data, count, error } = await supabase
    .from("submissions")
    .select("id, form_title, form_icon, user_name, submitted_at, fails", { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("result", "fail")
    .gte("submitted_at", new Date(bkkDayStart(Date.now())).toISOString())
    .order("submitted_at", { ascending: false })
    .limit(LIST_N);
  if (error) return null;
  const items = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    form_title: (r.form_title as string) || "ฟอร์ม",
    form_icon: (r.form_icon as string) || "📋",
    user_name: (r.user_name as string) || "",
    submitted_at: r.submitted_at as string,
    fails: Array.isArray(r.fails) ? r.fails.length : 0,
  }));
  return { count: count ?? items.length, items };
}

async function loadOverdueRounds(supabase: SupabaseClient, o: AttentionOpts): Promise<AttentionData["overdueRounds"]> {
  if (!o.hasSchedules) return null;
  // ผู้ดูแลเห็นทุกตาราง · คนอื่นเห็นเฉพาะที่ตัวเองรับผิดชอบ (ตรรกะเดียวกับแท็บ "รอบวันนี้")
  const rounds = await loadTodayRounds(supabase, o.tenantId, o.userId, o.manager, o.visibleFormIds);
  if (!rounds) return null;
  const overdue = rounds.filter((r) => r.status === "overdue" && (o.manager || r.mine));
  return {
    count: overdue.length,
    items: overdue.slice(0, LIST_N).map((r) => ({ formId: r.formId, title: r.title, icon: r.icon, time: r.time, due: r.due })),
  };
}

async function loadApprovals(supabase: SupabaseClient, o: AttentionOpts): Promise<AttentionData["approvals"]> {
  // หน้าอนุมัติเปิดให้เฉพาะผู้จัดการ — คนอื่นไม่ต้องเห็นส่วนนี้
  if (!o.manager || !o.canApprove) return null;
  if (o.role === "owner") {
    // owner เห็นทุกใบในคิว → นับอย่างเดียว ไม่ดึงแถว
    const { count, error } = await supabase
      .from("submissions").select("id", { count: "exact", head: true })
      .eq("tenant_id", o.tenantId).eq("approval_status", "pending");
    return error ? null : { count: count ?? 0, capped: false };
  }
  // คนอื่น: ถึงคิวฉันเมื่อผู้อนุมัติขั้นปัจจุบันคือฉัน หรือขั้นนั้นไม่ระบุคน (เงื่อนไขเดียวกับหน้าอนุมัติ)
  const { data, error } = await supabase
    .from("submissions").select("approval_step, approval_chain")
    .eq("tenant_id", o.tenantId).eq("approval_status", "pending")
    .order("submitted_at", { ascending: true })
    .limit(APPROVAL_CAP);
  if (error) return null;
  const rows = (data || []) as { approval_step: number | null; approval_chain: unknown }[];
  const count = rows.filter((s) => {
    const cur = sanitizeChain(s.approval_chain)[s.approval_step ?? 0];
    return !cur || cur.user_id === o.userId;
  }).length;
  return { count, capped: rows.length >= APPROVAL_CAP };
}

/** โหลดทุกส่วนขนานกัน — ไม่ throw (ส่วนที่พลาด = null) */
export async function loadAttention(supabase: SupabaseClient, o: AttentionOpts): Promise<AttentionData> {
  const safe = <T>(p: Promise<T>) => p.catch(() => null);
  const [failedToday, overdueRounds, approvals] = await Promise.all([
    safe(loadFailedToday(supabase, o.tenantId)),
    safe(loadOverdueRounds(supabase, o)),
    safe(loadApprovals(supabase, o)),
  ]);
  return { failedToday, overdueRounds, approvals };
}
