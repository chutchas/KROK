"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { PLANS, type PlanKey } from "@/lib/plans";

export async function setPlan(plan: PlanKey): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (session.role !== "owner") return { error: "เฉพาะ owner เปลี่ยนแผนได้" };
  if (!PLANS[plan]) return { error: "แผนไม่ถูกต้อง" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_plan", { p_tenant: session.tenantId, p_plan: plan });
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId,
    actor_id: session.userId,
    action: "plan.change",
    target_type: "tenant",
    target_id: session.tenantId,
    meta: { plan },
  });
  revalidatePath("/settings/billing");
  revalidatePath("/", "layout");
  return { ok: true };
}
