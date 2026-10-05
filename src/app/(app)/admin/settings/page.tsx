import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPaymentSettingsForAdmin } from "@/lib/payments-server";
import { getPlanCatalog } from "@/lib/plans-server";
import { planTenantCounts } from "./actions";
import type { AiProfiles, AiSettings } from "../ai/AdminAiClient";
import { AI_PURPOSES } from "@/lib/ai-purpose";
import SystemSettingsClient from "./SystemSettingsClient";

export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isPlatformAdmin)
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ Platform Admin เท่านั้น</div>;

  const admin = getAdminClient();

  // ---- AI settings (profile ต่อ purpose) ----
  const blank: AiSettings = {
    provider: "qwen", model: "", base_url: "", azure_endpoint: "", azure_api_version: "",
    key_last4: "", has_key: false, enabled: true, inherited: true,
  };
  const aiProfiles = Object.fromEntries(AI_PURPOSES.map((p) => [p, { ...blank }])) as AiProfiles;
  let aiConfigured = false;

  if (admin) {
    aiConfigured = true;
    const { data: rows } = await admin
      .from("platform_ai_profiles")
      .select("purpose, provider, model, base_url, azure_endpoint, azure_api_version, key_last4, api_key, enabled");

    for (const row of rows ?? []) {
      const key = row.purpose as keyof AiProfiles;
      if (!aiProfiles[key]) continue;
      const hasKey = !!(row.api_key && String(row.api_key).length > 0);
      aiProfiles[key] = {
        provider: (row.provider as AiSettings["provider"]) || "qwen",
        model: (row.model as string) || "",
        base_url: (row.base_url as string) || "",
        azure_endpoint: (row.azure_endpoint as string) || "",
        azure_api_version: (row.azure_api_version as string) || "",
        key_last4: (row.key_last4 as string) || "",
        has_key: hasKey,
        enabled: row.enabled !== false,
        inherited: !hasKey,
      };
    }

    // เผื่อยังไม่ได้รัน migration 0027 — อ่านค่าเดิมมาแสดงเป็นค่าตั้งต้น
    if (!aiProfiles.form_gen.has_key) {
      const { data } = await admin
        .from("platform_ai_settings")
        .select("provider, model, base_url, azure_endpoint, azure_api_version, key_last4, api_key")
        .eq("id", true)
        .maybeSingle();
      if (data?.api_key) {
        aiProfiles.form_gen = {
          provider: (data.provider as AiSettings["provider"]) || "qwen",
          model: (data.model as string) || "",
          base_url: (data.base_url as string) || "",
          azure_endpoint: (data.azure_endpoint as string) || "",
          azure_api_version: (data.azure_api_version as string) || "",
          key_last4: (data.key_last4 as string) || "",
          has_key: true,
          enabled: true,
          inherited: false,
        };
      }
    }
  }

  // ---- Payment settings ----
  const { configured: payConfigured, views: payViews } = await getPaymentSettingsForAdmin();

  // ---- Plan settings (ราคา/โควตา) ----
  const [plans, tenantCounts] = await Promise.all([getPlanCatalog(), planTenantCounts()]);

  return (
    <SystemSettingsClient
      aiProfiles={aiProfiles}
      aiConfigured={aiConfigured}
      payViews={payViews}
      payConfigured={payConfigured}
      plans={plans}
      plansConfigured={!!admin}
      tenantCounts={tenantCounts}
    />
  );
}
