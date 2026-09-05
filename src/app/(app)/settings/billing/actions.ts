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

  // ออกใบแจ้งหนี้ (เดโม) เมื่อเปลี่ยนไปแผนเสียเงิน — ยังไม่เรียกเก็บจริง
  const amount = PLANS[plan].priceThb;
  if (amount > 0) {
    const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
    await supabase.from("invoices").insert({
      tenant_id: session.tenantId,
      plan,
      amount,
      currency: "THB",
      period,
      status: "demo",
      issued_by: session.userId,
    });
  }

  revalidatePath("/settings/billing");
  revalidatePath("/settings/billing/history");
  revalidatePath("/", "layout");
  return { ok: true };
}
