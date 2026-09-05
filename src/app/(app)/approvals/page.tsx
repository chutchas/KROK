import { enforceMenu, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { sanitizeChain } from "@/lib/approval";
import ApprovalsClient from "./ApprovalsClient";
import type { PendingSub } from "./ApprovalsClient";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await enforceMenu("approvals");
  if (!canManage(session.role))
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับผู้อนุมัติ (owner/admin/designer) เท่านั้น</div>;

  const supabase = await createClient();
  const { data } = await supabase
    .from("submissions")
    .select("id, form_title, form_icon, user_name, result, fails, answers, submitted_at, approval_step, approval_chain")
    .eq("approval_status", "pending")
    .order("submitted_at", { ascending: true });

  const all = (data || []) as PendingSub[];
  // แสดงเฉพาะที่ถึงคิวฉัน: ผู้อนุมัติของขั้นปัจจุบันคือฉัน, หรือ chain ว่าง (ใครก็ได้), หรือฉันเป็น owner (เห็นทั้งหมด)
  const mine = all.filter((s) => {
    const chain = sanitizeChain(s.approval_chain);
    const cur = chain[s.approval_step ?? 0];
    if (!cur) return true; // ไม่ระบุเฉพาะราย → ผู้จัดการทุกคน
    return cur.user_id === session.userId || session.role === "owner";
  });

  return <ApprovalsClient initial={mine} myId={session.userId} isOwner={session.role === "owner"} />;
}
