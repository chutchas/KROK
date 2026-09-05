import { enforceMenu } from "@/lib/session";
import { getQuotaSnapshot } from "@/lib/quota";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const session = await enforceMenu("billing");

  const snap = await getQuotaSnapshot(session.tenantId);

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
    />
  );
}
