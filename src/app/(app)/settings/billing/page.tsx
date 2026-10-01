import { enforceMenu } from "@/lib/session";
import { getQuotaSnapshot } from "@/lib/quota";
import { getEnabledPaymentMethods } from "@/lib/payments-server";
import { getPlanCatalog } from "@/lib/plans-server";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const session = await enforceMenu("billing");

  const [snap, payMethods, plans] = await Promise.all([
    getQuotaSnapshot(session.tenantId),
    getEnabledPaymentMethods(),
    getPlanCatalog(),
  ]);

  return (
    <BillingClient
      isOwner={session.role === "owner"}
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
