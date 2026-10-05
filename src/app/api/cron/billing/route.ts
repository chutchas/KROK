import { NextResponse } from "next/server";
import { withCronLog } from "@/lib/cron-log";
import { getAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/cron-auth";
import { gatewayConfig } from "@/lib/billing-gateway";
import { runRenewals, remindExpiring } from "@/lib/billing-renew";
import { sendQuotaAlerts } from "@/lib/quota-alerts";
import { getEffectivePlans } from "@/lib/plans-server";
import { siteOrigin } from "@/lib/site-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// งานบิลรายวัน (Vercel Cron — ดู vercel.json) · Authorization: Bearer <CRON_SECRET>
// 1) ตัดเงินรอบต่ออายุอัตโนมัติ (ยังไม่ตั้ง Gateway = ข้าม)
// 2) เตือนเจ้าของบัญชีที่แพ็กเกจจะหมดอายุใน 3 วัน (ไม่ได้ต่ออัตโนมัติ)
// 3) เตือนเจ้าของบัญชีเมื่อโควตาใช้ถึง 80% / 100%
// 4) แพ็กเกจที่หมดอายุเกินช่วงผ่อนผัน → Free
// ============================================================
async function handle(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });

  let renew = null;
  if (gatewayConfig() && process.env.PAYMENTS_LIVE === "1") {
    const plans = await getEffectivePlans();
    renew = await runRenewals(admin, {
      origin: await siteOrigin(),
      planPrice: (k) => (plans[k] ? plans[k].priceThb : null),
      planName: (k) => plans[k]?.nameEn || plans[k]?.name || k,
    });
  }
  const reminded = await remindExpiring(admin).catch(() => 0); // ยังไม่รัน 0047 = 0
  const quotaAlerts = await sendQuotaAlerts(admin).catch(() => 0); // ยังไม่รัน 0048 = 0
  const { data: expired } = await admin.rpc("expire_account_plans");
  return NextResponse.json({ ok: true, renew, reminded, quotaAlerts, expiredPlans: typeof expired === "number" ? expired : 0 });
}

const logged = withCronLog("billing", handle);
export const GET = logged;
export const POST = logged;
