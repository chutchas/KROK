import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import AdminAiClient, { type AiSettings } from "./AdminAiClient";

export const dynamic = "force-dynamic";

export default async function PlatformAiPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isPlatformAdmin && session.platformRole !== "developer")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ Developer / Platform Admin เท่านั้น</div>;

  const admin = getAdminClient();
  let current: AiSettings = {
    provider: "qwen", model: "", base_url: "", azure_endpoint: "", azure_api_version: "", key_last4: "", has_key: false,
  };
  let configured = false;
  if (admin) {
    configured = true;
    const { data } = await admin
      .from("platform_ai_settings")
      .select("provider, model, base_url, azure_endpoint, azure_api_version, key_last4, api_key, updated_at")
      .eq("id", true)
      .maybeSingle();
    if (data) {
      current = {
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

  return <AdminAiClient current={current} configured={configured} />;
}
