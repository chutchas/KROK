"use server";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { PAYMENT_PROVIDERS, PAYMENT_PROVIDER_IDS, type PaymentProviderId } from "@/lib/payment-meta";

export interface SavePaymentInput {
  provider: PaymentProviderId;
  enabled: boolean;
  // ค่าฟิลด์ที่ผู้ใช้กรอก — ฟิลด์ลับที่เว้นว่าง = คงคีย์เดิม
  values: Record<string, string>;
}

// บันทึกการตั้งค่า provider ชำระเงินระดับแพลตฟอร์ม — เฉพาะ Platform Admin / Developer
export async function savePaymentProvider(
  input: SavePaymentInput
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!session.isPlatformAdmin && session.platformRole !== "developer")
    return { error: "เฉพาะ Platform Admin / Developer เท่านั้น" };

  const admin = getAdminClient();
  if (!admin) return { error: "ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY ฝั่ง server" };

  if (!PAYMENT_PROVIDER_IDS.includes(input.provider)) return { error: "ผู้ให้บริการไม่ถูกต้อง" };
  const meta = PAYMENT_PROVIDERS.find((p) => p.id === input.provider)!;

  // โหลดของเดิมทั้งก้อน
  const { data: row } = await admin
    .from("platform_payment_settings")
    .select("providers")
    .eq("id", true)
    .maybeSingle();
  const providers = ((row?.providers as Record<string, Record<string, unknown>>) ?? {});
  const prev = providers[input.provider] || {};

  // ประกอบ config ใหม่ของ provider นี้
  const next: Record<string, unknown> = { enabled: !!input.enabled };
  let lastSecret = "";
  for (const f of meta.fields) {
    const raw = (input.values?.[f.key] ?? "").toString().trim().slice(0, 300);
    if (f.secret) {
      // เว้นว่าง = คงคีย์เดิม
      const val = raw || (typeof prev[f.key] === "string" ? (prev[f.key] as string) : "");
      if (val) { next[f.key] = val; lastSecret = val; }
    } else {
      if (raw) next[f.key] = raw;
    }
  }
  if (lastSecret) next.key_last4 = lastSecret.slice(-4);
  else if (typeof prev.key_last4 === "string") next.key_last4 = prev.key_last4;

  // ถ้าจะ "เปิด" ต้องมี secret อย่างน้อยหนึ่งฟิลด์ (ยกเว้น promptpay ที่ไม่มี secret)
  const hasSecretField = meta.fields.some((f) => f.secret);
  if (input.enabled && hasSecretField && !meta.fields.some((f) => f.secret && next[f.key]))
    return { error: `ต้องใส่คีย์ของ ${meta.name} ก่อนจึงจะเปิดใช้งานได้` };
  if (input.enabled && !hasSecretField) {
    const need = meta.fields.find((f) => !f.secret);
    if (need && !next[need.key]) return { error: `กรุณากรอก ${need.label} ก่อนเปิดใช้งาน` };
  }

  providers[input.provider] = next;

  const { error } = await admin.from("platform_payment_settings").upsert(
    { id: true, providers, updated_by: session.userId, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) return { error: error.message };

  await admin.from("audit_log").insert({
    tenant_id: null,
    actor_id: session.userId,
    action: "platform.payment.update",
    target_type: "platform_payment_settings",
    meta: { provider: input.provider, enabled: !!input.enabled },
  });

  return { ok: true };
}
