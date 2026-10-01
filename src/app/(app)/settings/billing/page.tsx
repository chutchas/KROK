import { enforceMenu } from "@/lib/session";
import { getQuotaSnapshot } from "@/lib/quota";
import { getEnabledPaymentMethods } from "@/lib/payments-server";
import { getPlanCatalog } from "@/lib/plans-server";
import BillingClient from "./BillingClient";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
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

  return (
    <BillingClient
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
