import BillingClient from "./BillingClient";
import { loadBilling } from "./load";

export const dynamic = "force-dynamic";

// แท็บ "แผนปัจจุบัน/โควตา" (กลับจากหน้าชำระเงินก็มาที่นี่: ?invoice= / ?card=)
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ invoice?: string; card?: string }> }) {
  return <BillingClient view="quota" {...await loadBilling(await searchParams)} />;
}
