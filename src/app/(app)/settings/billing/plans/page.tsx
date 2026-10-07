import BillingClient from "../BillingClient";
import { loadBilling } from "../load";

export const dynamic = "force-dynamic";

// แท็บ "แพ็กเกจ" — เปรียบเทียบ/เลือกซื้อ
export default async function BillingPlansPage() {
  return <BillingClient view="plans" {...await loadBilling({})} />;
}
