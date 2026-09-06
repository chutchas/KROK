"use server";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";

export interface SavePlatformAiInput {
  provider: string;
  model: string;
  base_url: string;
  azure_endpoint: string;
  azure_api_version: string;
  api_key: string; // ว่าง = คงคีย์เดิม
}

// บันทึกการตั้งค่า AI ระดับแพลตฟอร์ม — เฉพาะ Platform Admin / Developer
export async function savePlatformAi(input: SavePlatformAiInput): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!session.isPlatformAdmin && session.platformRole !== "developer")
    return { error: "เฉพาะ Platform Admin / Developer เท่านั้น" };

  const admin = getAdminClient();
  if (!admin) return { error: "ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY ฝั่ง server" };

  const provider = ["qwen", "openai", "azure", "anthropic"].includes(input.provider) ? input.provider : "qwen";
  const newKey = (input.api_key || "").trim();

  // ต้องมีคีย์เดิมหรือคีย์ใหม่
  const { data: existing } = await admin
    .from("platform_ai_settings").select("api_key").eq("id", true).maybeSingle();
  if (!newKey && !(existing?.api_key)) return { error: "กรุณาใส่ API key" };

  const patch: Record<string, unknown> = {
    id: true,
    provider,
    model: (input.model || "").trim(),
    base_url: input.base_url?.trim() || null,
    azure_endpoint: input.azure_endpoint?.trim() || null,
    azure_api_version: input.azure_api_version?.trim() || null,
    updated_by: session.userId,
    updated_at: new Date().toISOString(),
  };
  if (newKey) {
    patch.api_key = newKey;
    patch.key_last4 = newKey.slice(-4);
  }

  const { error } = await admin.from("platform_ai_settings").upsert(patch, { onConflict: "id" });
  if (error) return { error: error.message };

  // audit (ระดับแพลตฟอร์ม: tenant_id = null)
  await admin.from("audit_log").insert({
    tenant_id: null,
    actor_id: session.userId,
    action: "platform.ai.update",
    target_type: "platform_ai_settings",
    meta: { provider, model: patch.model, key_changed: !!newKey },
  });

  return { ok: true };
}
