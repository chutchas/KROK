"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";

export async function reviewSubmission(
  id: string,
  decision: "approved" | "rejected",
  note: string
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์อนุมัติ" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("submissions")
    .update({
      approval_status: decision,
      reviewed_by: session.userId,
      reviewer_name: session.displayName,
      reviewed_at: new Date().toISOString(),
      review_note: note.slice(0, 500),
    })
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .eq("approval_status", "pending");
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId,
    actor_id: session.userId,
    action: "submission." + decision,
    target_type: "submission",
    target_id: id,
    meta: { note },
  });

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  return { ok: true };
}
