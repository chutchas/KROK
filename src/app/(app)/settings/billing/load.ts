import "server-only";
import { enforceMenu } from "@/lib/session";
import { getQuotaSnapshot } from "@/lib/quota";
import { getEnabledPaymentMethods } from "@/lib/payments-server";
import { getPlanCatalog } from "@/lib/plans-server";
import type BillingClient from "./BillingClient";
import type { ComponentProps } from "react";
import { getAdminClient } from "@/lib/supabase/admin";
import { paymentsEnabled } from "@/lib/billing-gateway";

/** ข้อมูลของหน้าแพ็กเกจทั้งสองแท็บ (แผนปัจจุบัน/โควตา · แพ็กเกจ) */
export async function loadBilling(sp: { invoice?: string; card?: string }): Promise<Omit<ComponentProps<typeof BillingClient>, "view">> {
  const { invoice, card } = sp;
  const session = await enforceMenu("billing");

  const [snap, payMethods, plans] = await Promise.all([
    getQuotaSnapshot(session.tenantId),
    getEnabledPaymentMethods(),
    getPlanCatalog(),
  ]);

  // เจ้าของบัญชีที่จ่าย (billing owner) — คนอื่นเห็นแพ็กเกจแต่เปลี่ยนไม่ได้
  const isBillingOwner = snap.ownerId ? snap.ownerId === session.userId : session.role === "owner";
  // ชื่อเจ้าของ (คนอื่นดู) · บัญชีแพ็กเกจ · ใบแจ้งหนี้ค้างจ่าย (เจ้าของ) — ยิงพร้อมกันรอบเดียว
  const admin2 = getAdminClient();
  let ownerName: string | null = null;
  let expiresAt: string | null = null;
  let sub: { autoRenew: boolean; cardLabel: string | null; hasCard: boolean; renewPrice: number | null; lastError: string | null; attempts: number } | null = null;
  let pending: { id: string; plan: string; amount: number; url: string } | null = null;
  let pendingChange: { key: string; name: string; nameEn: string; at: string } | null = null;
  if (admin2 && snap.ownerId) {
    const none = Promise.resolve({ data: null });
    const [{ data: owner }, { data: acct }, { data: inv }] = await Promise.all([
      !isBillingOwner ? admin2.from("memberships").select("name, email").eq("user_id", snap.ownerId).eq("tenant_id", session.tenantId).maybeSingle() : none,
      admin2.from("account_plans").select("*").eq("user_id", snap.ownerId).maybeSingle(),
      isBillingOwner
        ? admin2.from("invoices").select("id, plan, amount, checkout_url, checkout_expires_at").eq("user_id", session.userId)
            .eq("status", "pending").not("checkout_url", "is", null).order("issued_at", { ascending: false }).limit(1).maybeSingle()
        : none,
    ]);
    ownerName = (owner?.name as string) || (owner?.email as string) || null;
    // ลดแพ็กเกจที่ตั้งเวลาไว้ (0070) — อ่านจากแถวเดียวกัน
    const pp = acct?.pending_plan as string | undefined;
    if (pp && acct?.expires_at && Date.parse(acct.expires_at as string) > Date.now()) {
      const target = plans.find((x) => x.key === pp);
      pendingChange = { key: pp, name: target?.name ?? pp, nameEn: target?.nameEn ?? pp, at: acct.expires_at as string };
    }
    expiresAt = (acct?.expires_at as string) ?? null;
    if (acct && "auto_renew" in acct) // ยังไม่รัน 0047 = ไม่มีข้อมูลต่ออายุอัตโนมัติ
      sub = {
        autoRenew: !!acct.auto_renew,
        cardLabel: (acct.payment_method_label as string) ?? null,
        hasCard: !!acct.payment_method_ref,
        renewPrice: (acct.renew_price as number) ?? null,
        lastError: (acct.last_renew_error as string) ?? null,
        attempts: (acct.renew_attempts as number) ?? 0,
      };
    if (inv && (!inv.checkout_expires_at || new Date(inv.checkout_expires_at as string) > new Date()))
      pending = { id: inv.id as string, plan: inv.plan as string, amount: inv.amount as number, url: inv.checkout_url as string };
  }

  return {
      payable: paymentsEnabled(),
      pendingChange,
      expiresAt: expiresAt,
      subscription: sub,
      cardReturn: typeof card === "string" && /^[0-9a-f-]{36}$/i.test(card),
      pendingInvoice: pending,
      returnInvoice: typeof invoice === "string" && /^[0-9a-f-]{36}$/i.test(invoice) ? invoice : null,
      isOwner: isBillingOwner,
      ownerName: ownerName,
      workspaces: snap.workspaces,
      currentPlan: snap.plan.key,
      tenantName: session.tenantName,
      usage: {
        forms: snap.formsUsed,
        members: snap.membersUsed,
        ai: snap.aiByPurpose,
        period: snap.period,
        submissions: snap.submissionsMonth,
        storageMb: Math.round(snap.storageBytes / 1048576),
        datasets: snap.datasets,
        webhooks: snap.webhooks,
        intakeForms: snap.intakeForms,
        devices: snap.devices,
      },
      current: snap.plan,
      payMethods: payMethods,
      plans: plans.filter((p) => p.visible || p.key === snap.plan.key),
  };
}
