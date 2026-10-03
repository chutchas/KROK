"use server";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";
import { dispatchWebhooks } from "@/lib/webhooks";
import { dispatchNotifications } from "@/lib/notify";
import { runLater } from "@/lib/background";

export async function reviewSubmission(
  id: string,
  decision: "approved" | "rejected",
  note: string
): Promise<{ ok: true; advanced?: boolean } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์อนุมัติ" };

  const supabase = await createClient();
  // ตรวจคิวผู้อนุมัติ + เลื่อนขั้น/ปิดงาน ทำใน RPC (ฐานข้อมูลบังคับกติกาเดียวกัน กันการยิง REST ข้ามผู้อนุมัติ)
  const { data, error } = await supabase.rpc("review_submission", { p_id: id, p_decision: decision, p_note: note.slice(0, 500) });
  if (error || !data) {
    const m = error?.message || "อนุมัติไม่สำเร็จ";
    return { error: /review_submission/.test(m) && /does not exist|schema cache|not find/i.test(m) ? "ยังไม่ได้รัน migration 0036_review_rpc.sql" : m };
  }
  const r = data as { status: "pending" | "approved" | "rejected"; step: number; advanced: boolean; form_id: string; form_title: string; tenant_id: string };
  if (r.tenant_id !== session.tenantId) return { error: "ไม่พบรายการ" };
  const sub = { form_id: r.form_id, form_title: r.form_title };
  const newStatus = r.status;
  const advanced = r.advanced;
  const entry = { at: new Date().toISOString() };

  await writeAudit({
    tenant_id: session.tenantId,
    actor_id: session.userId,
    action: "submission." + decision,
    target_type: "submission",
    target_id: id,
    meta: { step: r.step, note, advanced },
  });

  // แจ้ง webhook เมื่อจบกระบวนการ (อนุมัติครบ หรือ ตีกลับ) — ไม่แจ้งตอนแค่เลื่อนขั้น
  if (newStatus === "approved" || newStatus === "rejected") {
    // best-effort: การอนุมัติ commit ไปแล้ว — webhook พังต้องไม่ทำให้ action ล้ม
    runLater(() => dispatchWebhooks(
        session.tenantId,
        newStatus === "approved" ? "submission.approved" : "submission.rejected",
        {
          submission_id: id,
          form_id: sub.form_id,
          form_title: sub.form_title,
          decision,
          reviewer_name: session.displayName,
          note: note.slice(0, 500),
          at: entry.at,
        },
        sub.form_id as string
      ));

    // แจ้งเตือน LINE/Email (best-effort)
    runLater(() => dispatchNotifications(
        session.tenantId,
        newStatus === "approved" ? "submission.approved" : "submission.rejected",
        {
          formTitle: sub.form_title as string,
          submissionId: id,
          reviewer: session.displayName,
          note: note.slice(0, 500),
        }
      ));
  }

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  return { ok: true, advanced };
}
