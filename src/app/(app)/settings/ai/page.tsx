import { enforceMenu } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import AiSettingsClient, { type AiSettings } from "./AiSettingsClient";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const session = await enforceMenu("ai");
  if (session.role !== "owner" && session.role !== "admin")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin เท่านั้น</div>;

  const supabase = await createClient();
  const { data } = await supabase.rpc("ai_settings_get");
  const row = Array.isArray(data) && data.length ? data[0] : null;

  const current: AiSettings = row
    ? {
        provider: row.provider || "qwen",
        model: row.model || "",
        base_url: row.base_url || "",
        azure_endpoint: row.azure_endpoint || "",
        azure_api_version: row.azure_api_version || "",
        key_last4: row.key_last4 || "",
        has_key: !!row.has_key,
      }
    : { provider: "qwen", model: "", base_url: "", azure_endpoint: "", azure_api_version: "", key_last4: "", has_key: false };

  return <AiSettingsClient current={current} />;
}
