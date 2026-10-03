"use server";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { type PlanKey } from "@/lib/plans";
import { getEffectivePlans } from "@/lib/plans-server";
import { paymentsEnabled, createCheckout, createCardSetup } from "@/lib/billing-gateway";
import { getTenantPool, currentPeriod } from "@/lib/quota";
import { siteOrigin } from "@/lib/site-origin";

export type SetPlanResult = { ok: true } | { checkoutUrl: string } | { error: string };

/**
 * เปลี่ยน/ซื้อ/ต่ออายุแพ็กเกจของบัญชี (เฉพาะเจ้าของบัญชี = คนสร้าง workspace)
 * - แพ็กเกจราคา 0 → เปลี่ยนทันที (ยกเลิกวันหมดอายุ)
 * - แพ็กเกจเสียเงิน → ออกใบแจ้งหนี้ pending + สร้างคำขอชำระที่ Payment Gateway → คืนลิงก์หน้าชำระ
 *   แพ็กเกจจะเปลี่ยนเมื่อ Gateway แจ้งผลสำเร็จกลับมาที่ /api/billing/callback เท่านั้น
 *   เลือกแพ็กเกจเดิม = ต่ออายุ (นับต่อจากวันหมดอายุเดิม)
 */
export async function setPlan(plan: PlanKey, opts: { autoRenew?: boolean } = {}): Promise<SetPlanResult> {
  const autoRenew = opts.autoRenew !== false;
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  const pool = await getTenantPool(session.tenantId);
  if (pool.ownerId ? pool.ownerId !== session.userId : session.role !== "owner")
    return { error: "เฉพาะเจ้าของบัญชีที่สร้าง workspace นี้เปลี่ยนแพ็กเกจได้" };
  const plans = await getEffectivePlans();
  const target = typeof plan === "string" ? plans[plan] : undefined;
  // ต้องเป็นแพ็กเกจที่เปิดให้ลูกค้าเลือก (ที่ซ่อน = แอดมินกำหนดให้เท่านั้น)
  if (!target || (!target.visible && plan !== "free")) return { error: "แผนไม่ถูกต้อง" };

  if (target.priceThb <= 0) {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_plan", { p_tenant: session.tenantId, p_plan: plan });
    if (error) return { error: error.message };
    await writeAudit({
      tenant_id: session.tenantId, actor_id: session.userId, action: "plan.change",
      target_type: "tenant", target_id: session.tenantId, meta: { plan },
    });
    revalidatePath("/settings/billing");
    revalidatePath("/", "layout");
    return { ok: true };
  }

  if (!paymentsEnabled()) return { error: "ระบบชำระเงินยังไม่เปิดให้บริการ — ยังไม่สามารถซื้อแผนนี้ได้" };
  const admin = getAdminClient();
  if (!admin) return { error: "ระบบยังไม่ได้ตั้งค่า service key" };

  // ใช้ใบแจ้งหนี้ที่ค้างจ่ายของแพ็กเกจเดียวกัน ถ้าลิงก์ยังไม่หมดอายุ (กันออกใบซ้ำเมื่อกดหลายครั้ง)
  const { data: open } = await admin
    .from("invoices")
    .select("id, checkout_url, checkout_expires_at, amount")
    .eq("user_id", session.userId).eq("plan", plan).eq("status", "pending").eq("kind", "checkout").eq("auto_renew", autoRenew)
    .order("issued_at", { ascending: false }).limit(1).maybeSingle();
  if (open?.checkout_url && open.amount === target.priceThb &&
      (!open.checkout_expires_at || new Date(open.checkout_expires_at as string).getTime() > Date.now() + 5 * 60_000))
    return { checkoutUrl: open.checkout_url as string };

  const { data: inv, error: invErr } = await admin.from("invoices").insert({
    tenant_id: session.tenantId,
    user_id: session.userId,
    plan,
    amount: target.priceThb,
    currency: "THB",
    period: currentPeriod(),
    months: 1,
    status: "pending",
    kind: "checkout",
    auto_renew: autoRenew, // ความยินยอมตัดเงินอัตโนมัติ (มีผลเมื่อจ่ายด้วยบัตร)
    issued_by: session.userId,
  }).select("id, number").single();
  if (invErr || !inv) return { error: invErr?.message || "ออกใบแจ้งหนี้ไม่สำเร็จ" };

  const origin = await siteOrigin();
  try {
    const co = await createCheckout({
      invoiceId: inv.id as string,
      invoiceNumber: (inv.number as string) ?? null,
      amountThb: target.priceThb,
      description: `KROK ${target.nameEn || target.name} — 1 เดือน`,
      customer: { email: session.email ?? null, name: session.displayName ?? null },
      returnUrl: `${origin}/settings/billing?invoice=${inv.id}`,
      callbackUrl: `${origin}/api/billing/callback`,
      metadata: { invoice_number: String(inv.number ?? ""), plan, user_id: session.userId, tenant_id: session.tenantId },
      savePaymentMethod: autoRenew,
    });
    await admin.from("invoices").update({
      gateway_ref: co.paymentId, checkout_url: co.checkoutUrl, checkout_expires_at: co.expiresAt,
    }).eq("id", inv.id);
    revalidatePath("/settings/billing/history");
    return { checkoutUrl: co.checkoutUrl };
  } catch (e) {
    await admin.from("invoices").update({ status: "void", note: "สร้างคำขอชำระไม่สำเร็จ" }).eq("id", inv.id);
    return { error: `เชื่อมต่อระบบชำระเงินไม่สำเร็จ — ลองใหม่อีกครั้ง (${e instanceof Error ? e.message : "error"})` };
  }
}

/** สถานะใบแจ้งหนี้ (หน้ากลับจาก Gateway ใช้ถามซ้ำจนกว่าจะได้ผล) */
export async function invoiceStatus(invoiceId: string): Promise<{ status: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  const admin = getAdminClient();
  if (!admin) return { error: "not configured" };
  const { data } = await admin.from("invoices").select("status, user_id").eq("id", invoiceId).maybeSingle();
  if (!data || data.user_id !== session.userId) return { error: "ไม่พบใบแจ้งหนี้" };
  return { status: data.status as string };
}

async function requireBillingOwner() {
  const session = await getSession();
  if (!session) return { error: "unauthorized" as const };
  const pool = await getTenantPool(session.tenantId);
  if (pool.ownerId ? pool.ownerId !== session.userId : session.role !== "owner")
    return { error: "เฉพาะเจ้าของบัญชีเปลี่ยนการตั้งค่าการชำระเงินได้" as const };
  const admin = getAdminClient();
  if (!admin) return { error: "ระบบยังไม่ได้ตั้งค่า service key" as const };
  return { session, admin };
}

/**
 * เปิด/ปิดต่ออายุอัตโนมัติ — ปิด = ใช้ได้ถึงสิ้นรอบแล้วลดเป็น Free เอง (ไม่ตัดเงินอีก)
 * เปิด = ต้องมีบัตรที่บันทึกไว้ และแพ็กเกจยังไม่หมดอายุเกินช่วงผ่อนผัน
 */
export async function setAutoRenew(on: boolean): Promise<{ ok: true } | { error: string }> {
  const g = await requireBillingOwner();
  if (!("admin" in g) || !g.admin) return { error: String(g.error) };
  const { session, admin } = g;
  const { data: acct } = await admin.from("account_plans")
    .select("plan, expires_at, payment_method_ref, renew_price").eq("user_id", session.userId).maybeSingle();
  if (!acct || acct.plan === "free") return { error: "ยังไม่มีแพ็กเกจเสียเงิน" };
  if (on) {
    if (!paymentsEnabled()) return { error: "ระบบชำระเงินยังไม่เปิดให้บริการ" };
    if (!acct.payment_method_ref) return { error: "ยังไม่มีบัตรที่บันทึกไว้ — เพิ่มบัตรก่อน" };
    if (!acct.expires_at || new Date(acct.expires_at as string).getTime() + 3 * 86400_000 < Date.now()) return { error: "แพ็กเกจหมดอายุแล้ว — ต่ออายุใหม่จากหน้าแพ็กเกจ" };
  }
  const plans = await getEffectivePlans();
  const patch: Record<string, unknown> = { auto_renew: on };
  if (on) Object.assign(patch, { renew_attempts: 0, next_attempt_at: null, last_renew_error: null, renew_price: acct.renew_price ?? plans[acct.plan as string]?.priceThb ?? null });
  const { error } = await admin.from("account_plans").update(patch).eq("user_id", session.userId);
  if (error) return { error: error.message };
  await admin.from("audit_log").insert({
    tenant_id: session.tenantId, actor_id: session.userId, action: on ? "plan.autorenew_on" : "plan.autorenew_off",
    target_type: "tenant", target_id: session.tenantId, meta: { plan: acct.plan },
  });
  revalidatePath("/settings/billing");
  return { ok: true };
}

/** เพิ่ม/เปลี่ยนบัตรสำหรับต่ออายุอัตโนมัติ → คืนลิงก์หน้าบันทึกบัตรของ Gateway */
export async function startCardUpdate(): Promise<{ setupUrl: string } | { error: string }> {
  const g = await requireBillingOwner();
  if (!("admin" in g) || !g.admin) return { error: String(g.error) };
  const { session, admin } = g;
  if (!paymentsEnabled()) return { error: "ระบบชำระเงินยังไม่เปิดให้บริการ" };
  const { data: setup, error } = await admin.from("card_setups").insert({ user_id: session.userId }).select("id").single();
  if (error || !setup) return { error: error?.message || "สร้างคำขอไม่สำเร็จ" };
  const origin = await siteOrigin();
  try {
    const r = await createCardSetup({
      setupId: setup.id as string,
      customer: { email: session.email ?? null, name: session.displayName ?? null },
      returnUrl: `${origin}/settings/billing?card=${setup.id}`,
      callbackUrl: `${origin}/api/billing/callback`,
    });
    await admin.from("card_setups").update({ gateway_ref: r.setupRef }).eq("id", setup.id);
    return { setupUrl: r.setupUrl };
  } catch (e) {
    await admin.from("card_setups").update({ status: "failed" }).eq("id", setup.id);
    return { error: `เชื่อมต่อระบบชำระเงินไม่สำเร็จ (${e instanceof Error ? e.message : "error"})` };
  }
}
