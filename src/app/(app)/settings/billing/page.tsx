import { enforceMenu } from "@/lib/session";
import { getQuotaSnapshot } from "@/lib/quota";
import { getEnabledPaymentMethods } from "@/lib/payments-server";
import { getPlanCatalog } from "@/lib/plans-server";
import BillingClient from "./BillingClient";
import { getAdminClient } from "@/lib/supabase/admin";
import { paymentsEnabled } from "@/lib/billing-gateway";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ invoice?: string }> }) {
  const { invoice } = await searchParams;
  const session = await enforceMenu("billing");

  const [snap, payMethods, plans] = await Promise.all([
    getQuotaSnapshot(session.tenantId),
    getEnabledPaymentMethods(),
    getPlanCatalog(),
  ]);

  // เจ้าของบัญชีที่จ่าย (billing owner) — คนอื่นเห็นแพ็กเกจแต่เปลี่ยนไม่ได้
  const isBillingOwner = snap.ownerId ? snap.ownerId === session.userId : session.role === "owner";
  let ownerName: string | null = null;
  if (snap.ownerId && !isBillingOwner) {
    const admin = getAdminClient();
    const { data } = admin
      ? await admin.from("memberships").select("name, email").eq("user_id", snap.ownerId).eq("tenant_id", session.tenantId).maybeSingle()
      : { data: null };
    ownerName = (data?.name as string) || (data?.email as string) || null;
  }

  // วันหมดอายุของแพ็กเกจ (บัญชีเจ้าของ) + ใบแจ้งหนี้ที่ค้างจ่าย (เจ้าของเท่านั้น)
  const admin2 = getAdminClient();
  let expiresAt: string | null = null;
  let pending: { id: string; plan: string; amount: number; url: string } | null = null;
  if (admin2 && snap.ownerId) {
    const [{ data: acct }, { data: inv }] = await Promise.all([
      admin2.from("account_plans").select("expires_at").eq("user_id", snap.ownerId).maybeSingle(),
      isBillingOwner
        ? admin2.from("invoices").select("id, plan, amount, checkout_url, checkout_expires_at").eq("user_id", session.userId)
            .eq("status", "pending").not("checkout_url", "is", null).order("issued_at", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    expiresAt = (acct?.expires_at as string) ?? null;
    if (inv && (!inv.checkout_expires_at || new Date(inv.checkout_expires_at as string) > new Date()))
      pending = { id: inv.id as string, plan: inv.plan as string, amount: inv.amount as number, url: inv.checkout_url as string };
  }

  return (
    <BillingClient
      payable={paymentsEnabled()}
      expiresAt={expiresAt}
      pendingInvoice={pending}
      returnInvoice={typeof invoice === "string" && /^[0-9a-f-]{36}$/i.test(invoice) ? invoice : null}
      isOwner={isBillingOwner}
      ownerName={ownerName}
      workspaces={snap.workspaces}
      currentPlan={snap.plan.key}
      tenantName={session.tenantName}
      usage={{
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
      }}
      current={snap.plan}
      payMethods={payMethods}
      plans={plans.filter((p) => p.visible || p.key === snap.plan.key)}
    />
  );
}
