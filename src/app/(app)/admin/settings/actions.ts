"use server";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { PAYMENT_PROVIDERS, PAYMENT_PROVIDER_IDS, type PaymentProviderId } from "@/lib/payment-meta";
import { PLAN_ORDER, type PlanKey, type PlanOverrides } from "@/lib/plans";

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

// ---- แผน & ราคา (override ระดับแพลตฟอร์ม) ----
const FIELDS = ["priceThb", "maxForms", "aiCreditsPerMonth", "maxMembers", "maxWorkspaces"] as const;

export async function savePlanSettings(
  input: PlanOverrides
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!session.isPlatformAdmin && session.platformRole !== "developer")
    return { error: "เฉพาะ Platform Admin / Developer เท่านั้น" };

  const admin = getAdminClient();
  if (!admin) return { error: "ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY ฝั่ง server" };

  // ทำความสะอาด: เก็บเฉพาะ plan key + field ที่รู้จัก, ค่าเป็นจำนวนเต็ม ≥ 0
  const clean: PlanOverrides = {};
  for (const k of PLAN_ORDER) {
    const raw = (input as Record<string, unknown>)[k];
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const entry: Record<string, number | string> = {};
    for (const f of FIELDS) {
      const v = o[f];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) entry[f] = Math.floor(v);
    }
    // ชื่อแพ็กเกจ (ตัวเลือก) — เก็บเป็น string สั้นๆ
    for (const nf of ["name", "nameEn"] as const) {
      const v = o[nf];
      if (typeof v === "string" && v.trim()) entry[nf] = v.trim().slice(0, 40);
    }
    if (Object.keys(entry).length) clean[k as PlanKey] = entry as PlanOverrides[PlanKey];
  }

  const { error } = await admin.from("platform_plan_settings").upsert(
    { id: true, plans: clean, updated_by: session.userId, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) return { error: error.message };

  await admin.from("audit_log").insert({
    tenant_id: null,
    actor_id: session.userId,
    action: "platform.plans.update",
    target_type: "platform_plan_settings",
    meta: { plans: Object.keys(clean) },
  });

  return { ok: true };
}
