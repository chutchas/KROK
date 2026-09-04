"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";
import { sanitizeChain, type ApprovalHistoryEntry } from "@/lib/approval";
import { dispatchWebhooks } from "@/lib/webhooks";

export async function reviewSubmission(
  id: string,
  decision: "approved" | "rejected",
  note: string
): Promise<{ ok: true; advanced?: boolean } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์อนุมัติ" };

  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, approval_status, approval_step, approval_chain, approval_history, form_title")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!sub) return { error: "ไม่พบรายการ" };
  if (sub.approval_status !== "pending") return { error: "รายการนี้ถูกดำเนินการไปแล้ว" };

  const chain = sanitizeChain(sub.approval_chain);
  const step = (sub.approval_step as number) ?? 0;
  const cur = chain[step];

  // สิทธิ์: ผู้อนุมัติที่ถูกกำหนดของขั้นนี้ หรือ owner (override) หรือ chain ว่าง+เป็นผู้จัดการ
  const isAssigned = cur ? cur.user_id === session.userId : canManage(session.role);
  if (!isAssigned && session.role !== "owner")
    return { error: "ยังไม่ถึงคิวคุณอนุมัติขั้นนี้" };

  const history = (Array.isArray(sub.approval_history) ? sub.approval_history : []) as ApprovalHistoryEntry[];
  const entry: ApprovalHistoryEntry = {
    step,
    label: cur?.label || `ขั้น ${step + 1}`,
    reviewer_name: session.displayName,
    decision,
    note: note.slice(0, 500),
    at: new Date().toISOString(),
  };

  let newStatus: "pending" | "approved" | "rejected";
  let newStep = step;
  let advanced = false;
  if (decision === "rejected") {
    newStatus = "rejected";
  } else if (chain.length > 0 && step < chain.length - 1) {
    newStatus = "pending"; // เลื่อนไปขั้นถัดไป
    newStep = step + 1;
    advanced = true;
  } else {
    newStatus = "approved"; // ขั้นสุดท้าย (หรือ chain ว่าง = ขั้นเดียว)
  }

  const { error } = await supabase
    .from("submissions")
    .update({
      approval_status: newStatus,
      approval_step: newStep,
      approval_history: [...history, entry],
      reviewed_by: session.userId,
      reviewer_name: session.displayName,
      reviewed_at: new Date().toISOString(),
      review_note: note.slice(0, 500),
    })
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .eq("approval_status", "pending"); // กันชนกันหลายคนกดพร้อมกัน
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId,
    actor_id: session.userId,
    action: "submission." + decision,
    target_type: "submission",
    target_id: id,
    meta: { step, note, advanced },
  });

  // แจ้ง webhook เมื่อจบกระบวนการ (อนุมัติครบ หรือ ตีกลับ) — ไม่แจ้งตอนแค่เลื่อนขั้น
  if (newStatus === "approved" || newStatus === "rejected") {
    await dispatchWebhooks(
      session.tenantId,
      newStatus === "approved" ? "submission.approved" : "submission.rejected",
      {
        submission_id: id,
        form_title: sub.form_title,
        decision,
        reviewer_name: session.displayName,
        note: note.slice(0, 500),
        at: entry.at,
      }
    );
  }

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  return { ok: true, advanced };
}
