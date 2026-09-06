import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  PAYMENT_PROVIDERS,
  type PaymentProviderId,
  type ProviderClientView,
} from "@/lib/payment-meta";

interface RawProvider {
  enabled?: boolean;
  [k: string]: unknown;
}
type ProvidersMap = Record<string, RawProvider>;

async function loadProviders(): Promise<{ configured: boolean; providers: ProvidersMap }> {
  const admin = getAdminClient();
  if (!admin) return { configured: false, providers: {} };
  const { data } = await admin
    .from("platform_payment_settings")
    .select("providers")
    .eq("id", true)
    .maybeSingle();
  return { configured: true, providers: ((data?.providers as ProvidersMap) ?? {}) };
}

// มุมมองสำหรับหน้าตั้งค่า (staff) — ปิดบัง secret เหลือแค่ 4 ตัวท้าย
export async function getPaymentSettingsForAdmin(): Promise<{
  configured: boolean;
  views: Record<PaymentProviderId, ProviderClientView>;
}> {
  const { configured, providers } = await loadProviders();
  const views = {} as Record<PaymentProviderId, ProviderClientView>;
  for (const p of PAYMENT_PROVIDERS) {
    const cur = providers[p.id] || {};
    const values: Record<string, string> = {};
    const secretSet: Record<string, boolean> = {};
    const secretLast4: Record<string, string> = {};
    for (const f of p.fields) {
      const v = typeof cur[f.key] === "string" ? (cur[f.key] as string) : "";
      if (f.secret) {
        secretSet[f.key] = v.length > 0;
        secretLast4[f.key] = v ? v.slice(-4) : "";
      } else {
        values[f.key] = v;
      }
    }
    views[p.id] = { enabled: !!cur.enabled, values, secretSet, secretLast4 };
  }
  return { configured, views };
}

// ช่องทางที่ "เปิด" ไว้ — สำหรับแสดงให้ลูกค้าเห็น (ไม่มี secret)
export async function getEnabledPaymentMethods(): Promise<{ id: PaymentProviderId; name: string; hint: string }[]> {
  const { providers } = await loadProviders();
  return PAYMENT_PROVIDERS.filter((p) => providers[p.id]?.enabled).map((p) => ({
    id: p.id,
    name: p.name,
    hint: p.hint,
  }));
}
