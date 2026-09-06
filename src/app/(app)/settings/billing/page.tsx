import { enforceMenu } from "@/lib/session";
import { getQuotaSnapshot } from "@/lib/quota";
import { getEnabledPaymentMethods } from "@/lib/payments-server";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const session = await enforceMenu("billing");

  const [snap, payMethods] = await Promise.all([
    getQuotaSnapshot(session.tenantId),
    getEnabledPaymentMethods(),
  ]);

  return (
    <BillingClient
      isOwner={session.role === "owner"}
      currentPlan={snap.plan.key}
      tenantName={session.tenantName}
      usage={{
        forms: snap.formsUsed,
        members: snap.membersUsed,
        ai: snap.aiUsed,
        period: snap.period,
      }}
      payMethods={payMethods}
    />
  );
}
