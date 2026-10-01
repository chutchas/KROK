"use server";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { PAYMENT_PROVIDERS, PAYMENT_PROVIDER_IDS, type PaymentProviderId } from "@/lib/payment-meta";
import { revalidatePath } from "next/cache";
import { PLANS, PLAN_KEY_RE, BUILTIN_KEYS, cleanPlan, blankPlan, normalizeCatalog, toStored, type Plan } from "@/lib/plans";

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

// ---- แคตตาล็อกแพ็กเกจ (สร้าง/แก้/ซ่อน/เรียง/ลบ) ----

/**
 * บันทึกแคตตาล็อกทั้งชุด — เฉพาะ Platform Admin / Developer
 * - แพ็กเกจตั้งต้น (free/pro/business) ลบไม่ได้ · free แสดงเสมอ
 * - ลบแพ็กเกจที่ยังมี workspace ใช้อยู่ไม่ได้ (ให้ซ่อนแทน)
 * มีผลทันทีกับหน้าแผน/โควตา หน้า home และการบังคับโควตา (DB อ่านชุดเดียวกัน)
 */
export async function savePlanCatalog(input: unknown[]): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!session.isPlatformAdmin && session.platformRole !== "developer")
    return { error: "เฉพาะ Platform Admin / Developer เท่านั้น" };
  const admin = getAdminClient();
  if (!admin) return { error: "ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY ฝั่ง server" };
  if (!Array.isArray(input) || input.length > 30) return { error: "ข้อมูลแพ็กเกจไม่ถูกต้อง" };

  const seen = new Set<string>();
  const list: Plan[] = [];
  for (const raw of input) {
    const key = (raw as { key?: unknown } | null)?.key;
    if (typeof key !== "string" || !PLAN_KEY_RE.test(key)) return { error: `รหัสแพ็กเกจ "${String(key)}" ไม่ถูกต้อง (a-z, 0-9, -, _ ยาว 2–30 ตัว ขึ้นต้นด้วยตัวอักษร)` };
    if (seen.has(key)) return { error: `รหัสแพ็กเกจ "${key}" ซ้ำ` };
    seen.add(key);
    const p = cleanPlan(raw, PLANS[key] ?? blankPlan(key));
    if (!p.name.trim()) return { error: `ตั้งชื่อแพ็กเกจ "${key}" ก่อน` };
    list.push(p);
  }
  for (const k of BUILTIN_KEYS) if (!seen.has(k)) return { error: `ลบแพ็กเกจตั้งต้น "${k}" ไม่ได้ (ซ่อนได้ ยกเว้น free)` };

  // กันลบแพ็กเกจที่ยังมีลูกค้าใช้
  const { data: cur } = await admin.from("platform_plan_settings").select("plans").eq("id", true).maybeSingle();
  const removed = normalizeCatalog(cur?.plans).map((p) => p.key).filter((k) => !seen.has(k));
  if (removed.length) {
    const acct = await admin.from("account_plans").select("user_id", { count: "exact", head: true }).in("plan", removed);
    const count = acct.error
      ? (await admin.from("tenants").select("id", { count: "exact", head: true }).in("plan", removed)).count // ยังไม่รัน 0045
      : acct.count;
    if ((count ?? 0) > 0) return { error: `ยังมี ${count} บัญชีใช้แพ็กเกจ ${removed.join(", ")} อยู่ — ซ่อนแพ็กเกจแทนการลบ หรือย้ายบัญชีไปแพ็กเกจอื่นก่อน (หน้าจัดการผู้ใช้)` };
  }

  const normalized = normalizeCatalog(toStored(list));
  const { error } = await admin.from("platform_plan_settings").upsert(
    { id: true, plans: toStored(normalized), updated_by: session.userId, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) return { error: error.message };

  await admin.from("audit_log").insert({
    tenant_id: null,
    actor_id: session.userId,
    action: "platform.plans.update",
    target_type: "platform_plan_settings",
    meta: { plans: normalized.map((p) => p.key), removed },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** จำนวน workspace ต่อแพ็กเกจ (แสดงในหน้าแอดมิน) */
export async function planTenantCounts(): Promise<Record<string, number>> {
  const session = await getSession();
  if (!session || (!session.isPlatformAdmin && session.platformRole !== "developer")) return {};
  const admin = getAdminClient();
  if (!admin) return {};
  // นับบัญชีต่อแพ็กเกจ (0045) · ยังไม่รัน = นับ workspace แบบเดิม
  const acct = await admin.from("account_plans").select("plan").limit(100000);
  const rows = acct.error ? (await admin.from("tenants").select("plan").limit(100000)).data : acct.data;
  const out: Record<string, number> = {};
  for (const r of (rows || []) as { plan: string | null }[]) out[r.plan || "free"] = (out[r.plan || "free"] ?? 0) + 1;
  return out;
}
