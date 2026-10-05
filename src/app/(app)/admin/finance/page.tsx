import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { loadFinance } from "@/lib/platform-finance";
import { isMonth, recentMonths } from "@/lib/finance-calc";
import { nowMs } from "@/lib/clock";
import FinanceClient from "./FinanceClient";

export const dynamic = "force-dynamic";

// ยอดขาย subscription + การใช้ AI token แปลงเป็นต้นทุน (บาท)
export default async function FinancePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isPlatformAdmin) return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ Platform Admin เท่านั้น</div>;
  const admin = getAdminClient();
  if (!admin) return <div style={{ color: "var(--fail)" }}>ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY ฝั่ง server</div>;
  const now = nowMs();
  const { m } = await searchParams;
  const allowed = recentMonths(now, 12);
  const month = isMonth(m) && allowed.includes(m) ? m : allowed[0];
  const report = await loadFinance(admin, month, now);
  return <FinanceClient report={report} />;
}
