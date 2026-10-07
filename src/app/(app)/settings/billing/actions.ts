"use server";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
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

export type SetPlanResult = { ok: true; scheduledAt?: string } | { checkoutUrl: string } | { error: string };

/**
 * เปลี่ยน/ซื้อ/ต่ออายุแพ็กเกจของบัญชี (เฉพาะเจ้าของบัญชี = คนสร้าง workspace)
 * - แพ็กเกจราคา 0 → ยังอยู่ในรอบแพ็กเกจเสียเงิน = ตั้งเวลาเปลี่ยนเมื่อหมดรอบ (0070) · ไม่มีรอบค้าง = เปลี่ยนทันที
 * - แพ็กเกจเสียเงินที่ถูกกว่าแพ็กเกจปัจจุบัน ระหว่างรอบที่จ่ายแล้ว → ไม่ให้ซื้อ (ซื้อได้เมื่อหมดรอบ)
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
    return { error: await sm("เฉพาะเจ้าของบัญชีที่สร้าง workspace นี้เปลี่ยนแพ็กเกจได้") };
  const plans = await getEffectivePlans();
  const target = typeof plan === "string" ? plans[plan] : undefined;
  // ต้องเป็นแพ็กเกจที่เปิดให้ลูกค้าเลือก (ที่ซ่อน = แอดมินกำหนดให้เท่านั้น)
  if (!target || (!target.visible && plan !== "free")) return { error: await sm("แผนไม่ถูกต้อง") };

  const admin0 = getAdminClient();
  const { data: acct } = admin0 && pool.ownerId
    ? await admin0.from("account_plans").select("plan, expires_at").eq("user_id", pool.ownerId).maybeSingle()
    : { data: null };
  const activeUntil = acct?.expires_at && Date.parse(acct.expires_at as string) > Date.now() ? (acct.expires_at as string) : null;
  const currentPlan = acct?.plan ? plans[acct.plan as string] : undefined;

  if (target.priceThb <= 0) {
    const supabase = await createClient();
    let scheduledAt: string | undefined;
    const r = await supabase.rpc("request_plan_change", { p_tenant: session.tenantId, p_plan: plan });
    if (r.error && /request_plan_change|function/i.test(r.error.message) && /not find|does not exist|schema cache/i.test(r.error.message)) {
      // ยังไม่รัน 0070 → เปลี่ยนทันทีแบบเดิม
      const { error } = await supabase.rpc("set_plan", { p_tenant: session.tenantId, p_plan: plan });
      if (error) return { error: await sm(dbError(error)) };
    } else if (r.error) {
      return { error: await sm(dbError(r.error)) };
    } else if (r.data === "scheduled" && activeUntil) {
      scheduledAt = activeUntil;
    }
    await writeAudit({
      tenant_id: session.tenantId, actor_id: session.userId, action: scheduledAt ? "plan.change_scheduled" : "plan.change",
      target_type: "tenant", target_id: session.tenantId, meta: scheduledAt ? { plan, at: scheduledAt } : { plan },
    });
    revalidatePath("/settings/billing");
    revalidatePath("/", "layout");
    return scheduledAt ? { ok: true, scheduledAt } : { ok: true };
  }

  // ลดเป็นแพ็กเกจเสียเงินที่ถูกกว่า ระหว่างรอบที่จ่ายแล้ว → ต้องรอหมดรอบ (ไม่ให้เสียวันที่จ่ายไปแล้ว)
  if (activeUntil && currentPlan && currentPlan.key !== target.key && target.priceThb < currentPlan.priceThb) {
    const d = new Date(activeUntil).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });
    return { error: await sm(`เปลี่ยนเป็นแพ็กเกจที่ราคาต่ำกว่าได้เมื่อรอบปัจจุบันหมด (${d}) — ระหว่างนี้ยังใช้แพ็กเกจเดิมได้ครบ`) };
  }

  if (!paymentsEnabled()) return { error: await sm("ระบบชำระเงินยังไม่เปิดให้บริการ — ยังไม่สามารถซื้อแผนนี้ได้") };
  const admin = getAdminClient();
  if (!admin) return { error: await sm("ระบบยังไม่ได้ตั้งค่า service key") };

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
  if (!data || data.user_id !== session.userId) return { error: await sm("ไม่พบใบแจ้งหนี้") };
  return { status: data.status as string };
}

async function requireBillingOwner() {
  const session = await getSession();
  if (!session) return { error: "unauthorized" as const };
  const pool = await getTenantPool(session.tenantId);
  if (pool.ownerId ? pool.ownerId !== session.userId : session.role !== "owner")
    return { error: await sm("เฉพาะเจ้าของบัญชีเปลี่ยนการตั้งค่าการชำระเงินได้") };
  const admin = getAdminClient();
  if (!admin) return { error: await sm("ระบบยังไม่ได้ตั้งค่า service key") };
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
  if (!acct || acct.plan === "free") return { error: await sm("ยังไม่มีแพ็กเกจเสียเงิน") };
  if (on) {
    if (!paymentsEnabled()) return { error: await sm("ระบบชำระเงินยังไม่เปิดให้บริการ") };
    if (!acct.payment_method_ref) return { error: await sm("ยังไม่มีบัตรที่บันทึกไว้ — เพิ่มบัตรก่อน") };
    if (!acct.expires_at || new Date(acct.expires_at as string).getTime() + 3 * 86400_000 < Date.now()) return { error: await sm("แพ็กเกจหมดอายุแล้ว — ต่ออายุใหม่จากหน้าแพ็กเกจ") };
  }
  const plans = await getEffectivePlans();
  const patch: Record<string, unknown> = { auto_renew: on };
  if (on) Object.assign(patch, { renew_attempts: 0, next_attempt_at: null, last_renew_error: null, renew_price: acct.renew_price ?? plans[acct.plan as string]?.priceThb ?? null });
  const { error } = await admin.from("account_plans").update(patch).eq("user_id", session.userId);
  if (error) return { error: await sm(dbError(error)) };
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
  if (!paymentsEnabled()) return { error: await sm("ระบบชำระเงินยังไม่เปิดให้บริการ") };
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


/** ยกเลิกการลดแพ็กเกจที่ตั้งเวลาไว้ (0070) */
export async function cancelPlanChange(): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_plan_change", { p_tenant: session.tenantId });
  if (error) return { error: await sm(dbError(error)) };
  await writeAudit({ tenant_id: session.tenantId, actor_id: session.userId, action: "plan.change_cancelled", target_type: "tenant", target_id: session.tenantId, meta: {} });
  revalidatePath("/settings/billing");
  revalidatePath("/", "layout");
  return { ok: true };
}
