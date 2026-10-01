import { Suspense } from "react";
import HomeClient from "./HomeClient";
import { getPublicPlans } from "@/lib/plans-server";

// แพ็กเกจที่แสดงอ่านจากแคตตาล็อก (Platform Admin แก้แล้วเห็นทันที)
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const plans = await getPublicPlans().catch(() => undefined);
  return (
    <Suspense fallback={<div style={{ padding: 56, textAlign: "center", color: "var(--ink-3)" }}>กำลังโหลด…</div>}>
      <HomeClient plans={plans} />
    </Suspense>
  );
}
