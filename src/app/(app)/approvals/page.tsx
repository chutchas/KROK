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
    .eq("tenant_id", session.tenantId) // เฉพาะ workspace ที่เปิดอยู่ (อนุมัติได้เฉพาะที่นี่อยู่แล้ว)
    .order("submitted_at", { ascending: true })
    .limit(500); // กันหน้าโหลดทั้งหมดเมื่อค้างสะสมมาก (คิวเก่าสุดขึ้นก่อน)

  const all = (data || []) as PendingSub[];
  // แสดงเฉพาะที่ถึงคิวฉัน: ผู้อนุมัติของขั้นปัจจุบันคือฉัน, หรือ chain ว่าง (ใครก็ได้), หรือฉันเป็น owner (เห็นทั้งหมด)
  const mine = all.filter((s) => {
    const chain = sanitizeChain(s.approval_chain);
    const cur = chain[s.approval_step ?? 0];
    if (!cur) return true; // ไม่ระบุเฉพาะราย → ผู้จัดการทุกคน
    return cur.user_id === session.userId || session.role === "owner";
  });

  // ส่งไป client เฉพาะที่หน้านี้ใช้ (ตัดค่าดิบ/แถวตาราง/ข้อความยาว) — คิว 500 รายการไม่ทำให้หน้าบวม
  const slim: PendingSub[] = mine.map((s) => ({
    ...s,
    answers: (Array.isArray(s.answers) ? s.answers : []).map((a) => ({
      label: a.label,
      type: a.type,
      display: typeof a.display === "string" && a.display.length > 300 ? a.display.slice(0, 300) + "…" : a.display,
      note: a.note,
      fail: a.fail,
    })),
  }));

  return <ApprovalsClient initial={slim} myId={session.userId} isOwner={session.role === "owner"} />;
}
