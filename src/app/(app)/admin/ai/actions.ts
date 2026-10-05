"use server";
import { sm } from "@/lib/server-msg";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { isAiPurpose } from "@/lib/ai-purpose";

export interface SavePlatformAiInput {
  purpose: string;
  provider: string;
  model: string;
  base_url: string;
  azure_endpoint: string;
  azure_api_version: string;
  api_key: string; // ว่าง = คงคีย์เดิม
}

// บันทึกการตั้งค่า AI ของ purpose หนึ่ง ๆ (ระดับแพลตฟอร์ม) — เฉพาะ Platform Admin
export async function savePlatformAi(input: SavePlatformAiInput): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!session.isPlatformAdmin)
    return { error: await sm("เฉพาะ Platform Admin เท่านั้น") };

  const admin = getAdminClient();
  if (!admin) return { error: await sm("ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY ฝั่ง server") };

  if (!isAiPurpose(input.purpose)) return { error: await sm("purpose ไม่ถูกต้อง") };
  const purpose = input.purpose;

  const provider = ["qwen", "openai", "azure", "anthropic"].includes(input.provider) ? input.provider : "qwen";
  const newKey = (input.api_key || "").trim();

  // ต้องมีคีย์เดิมของ purpose นี้ หรือคีย์ใหม่
  const { data: existing } = await admin
    .from("platform_ai_profiles").select("api_key, provider, base_url, azure_endpoint").eq("purpose", purpose).maybeSingle();
  if (!newKey && !existing?.api_key) return { error: await sm("กรุณาใส่ API key") };
  // เปลี่ยนผู้ให้บริการ/ปลายทาง แต่ใช้คีย์เดิม → ต้องกรอกคีย์ใหม่ (กันส่งคีย์เดิมไปเซิร์ฟเวอร์อื่น)
  if (!newKey && existing && (
    (existing.provider || "") !== provider ||
    (existing.base_url || "") !== (input.base_url?.trim() || "") ||
    (existing.azure_endpoint || "") !== (input.azure_endpoint?.trim() || "")
  )) return { error: await sm("เปลี่ยนผู้ให้บริการหรือ URL แล้ว ต้องกรอก API key ใหม่") };

  const patch: Record<string, unknown> = {
    purpose,
    enabled: true,
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

  const { error } = await admin.from("platform_ai_profiles").upsert(patch, { onConflict: "purpose" });
  if (error) return { error: error.message };

  // audit (ระดับแพลตฟอร์ม: tenant_id = null)
  await admin.from("audit_log").insert({
    tenant_id: null,
    actor_id: session.userId,
    action: "platform.ai.update",
    target_type: "platform_ai_profiles",
    meta: { purpose, provider, model: patch.model, key_changed: !!newKey },
  });

  return { ok: true };
}
