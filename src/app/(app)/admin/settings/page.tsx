import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPaymentSettingsForAdmin } from "@/lib/payments-server";
import type { AiSettings } from "../ai/AdminAiClient";
import SystemSettingsClient from "./SystemSettingsClient";

export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isPlatformAdmin && session.platformRole !== "developer")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ Developer / Platform Admin เท่านั้น</div>;

  const admin = getAdminClient();

  // ---- AI settings ----
  let ai: AiSettings = {
    provider: "qwen", model: "", base_url: "", azure_endpoint: "", azure_api_version: "", key_last4: "", has_key: false,
  };
  let aiConfigured = false;
  if (admin) {
    aiConfigured = true;
    const { data } = await admin
      .from("platform_ai_settings")
      .select("provider, model, base_url, azure_endpoint, azure_api_version, key_last4, api_key")
      .eq("id", true)
      .maybeSingle();
    if (data) {
      ai = {
        provider: (data.provider as AiSettings["provider"]) || "qwen",
        model: (data.model as string) || "",
        base_url: (data.base_url as string) || "",
        azure_endpoint: (data.azure_endpoint as string) || "",
        azure_api_version: (data.azure_api_version as string) || "",
        key_last4: (data.key_last4 as string) || "",
        has_key: !!(data.api_key && String(data.api_key).length > 0),
      };
    }
  }

  // ---- Payment settings ----
  const { configured: payConfigured, views: payViews } = await getPaymentSettingsForAdmin();

  return (
    <SystemSettingsClient
      ai={ai}
      aiConfigured={aiConfigured}
      payViews={payViews}
      payConfigured={payConfigured}
    />
  );
}
