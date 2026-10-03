import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPlan, fmtLimit, UNLIMITED, type Plan } from "@/lib/plans";
import { cache } from "react";
import { getEffectivePlans } from "@/lib/plans-server";
import { quotaError } from "@/lib/quota-msg";
import { AI_PURPOSES, PURPOSE_LABELS, type AiPurpose } from "@/lib/ai-purpose";

/** วันแรกของเดือนปัจจุบัน (UTC) — ใช้นับการส่งฟอร์มรายเดือนให้ตรงกับ trigger ใน DB */
export function monthStart(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ============================================================
// แพ็กเกจผูกกับบัญชี "เจ้าของ" (billing owner = คนสร้าง workspace) — migration 0045
// โควตานับรวมทุก workspace ของเจ้าของคนเดียวกัน (pool) · ข้อมูลยังแยกอยู่ใน workspace ของตัวเอง
// ยังไม่รัน 0045 → ใช้ tenants.plan และนับเฉพาะ workspace นี้ (แบบเดิม)
// ============================================================

export interface TenantPool {
  /** billing owner (null = หาไม่ได้/ยังไม่รัน 0045) */
  ownerId: string | null;
  /** workspace ทั้งหมดที่ใช้โควตาร่วมกัน (รวมตัวเอง) */
  tenantIds: string[];
}

const db = async () => getAdminClient() ?? (await createClient());

export const getTenantPool = cache(async (tenantId: string): Promise<TenantPool> => {
  const c = await db();
  const [owner, ids] = await Promise.all([
    c.rpc("tenant_billing_owner", { p_tenant: tenantId }),
    c.rpc("tenant_pool_ids", { p_tenant: tenantId }),
  ]);
  const list = Array.isArray(ids.data) ? (ids.data as string[]) : [];
  return {
    ownerId: !owner.error && typeof owner.data === "string" ? owner.data : null,
    tenantIds: !ids.error && list.length ? Array.from(new Set([tenantId, ...list])) : [tenantId],
  };
});

/** key แพ็กเกจของบัญชีผู้ใช้ (ไม่มีแถว = free · ยังไม่รัน 0045 = null) */
export async function getUserPlanKey(userId: string): Promise<string | null> {
  const c = await db();
  const { data, error } = await c.from("account_plans").select("plan").eq("user_id", userId).maybeSingle();
  if (error) return null;
  return (data?.plan as string) || "free";
}

/** แพ็กเกจของบัญชีผู้ใช้ — ยังไม่รัน 0045 ใช้แพ็กเกจของ workspace ที่ส่งมาแทน */
export async function getUserPlan(userId: string, fallbackTenantId?: string): Promise<Plan> {
  const [key, plans] = await Promise.all([getUserPlanKey(userId), getEffectivePlans()]);
  if (key === null && fallbackTenantId) return getTenantPlan(fallbackTenantId);
  return getPlan(key, plans);
}

/** แพ็กเกจที่ workspace นี้ใช้ (= แพ็กเกจของ billing owner) */
export const getTenantPlan = cache(async (tenantId: string): Promise<Plan> => {
  const c = await db();
  const [res, plans] = await Promise.all([c.rpc("tenant_plan_key", { p_tenant: tenantId }), getEffectivePlans()]);
  if (!res.error && typeof res.data === "string") return getPlan(res.data, plans);
  const { data } = await c.from("tenants").select("plan").eq("id", tenantId).maybeSingle(); // ยังไม่รัน 0045
  return getPlan(data?.plan as string | undefined, plans);
});

/** workspace ที่ผู้ใช้เป็น billing owner */
export async function ownedTenantIds(userId: string): Promise<string[] | null> {
  const admin = getAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.rpc("owner_tenant_ids", { p_owner: userId });
  return error || !Array.isArray(data) ? null : (data as string[]);
}

async function countIn(table: string, ids: string[], extra?: (q: any) => any, col = "id"): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const c = await db();
  let q = c.from(table).select(col, { count: "exact", head: true }).in("tenant_id", ids);
  if (extra) q = extra(q);
  const { count } = await q;
  return count ?? 0;
}

/** ผู้ใช้ไม่ซ้ำในทุก workspace ของกลุ่ม */
async function distinctMembers(ids: string[]): Promise<number> {
  const c = await db();
  const { data } = await c.from("memberships").select("user_id").in("tenant_id", ids).limit(50000);
  return new Set(((data || []) as { user_id: string }[]).map((r) => r.user_id)).size;
}

export interface QuotaSnapshot {
  plan: Plan;
  formsUsed: number;
  membersUsed: number;
  /** ยอดรวมทุก purpose (ใช้แสดงภาพรวม) */
  aiUsed: number;
  /** ยอดแยกต่อ purpose — ตัวที่ใช้บังคับโควตาจริง */
  aiByPurpose: Record<AiPurpose, number>;
  period: string;
  /** จำนวน workspace ที่ใช้โควตาร่วมกัน */
  workspaces: number;
  ownerId: string | null;
  submissionsMonth: number;
  storageBytes: number;
  datasets: number;
  datasetApi: number;
  webhooks: number;
  intakeForms: number;
  devices: number;
}

const zeroUsage = (): Record<AiPurpose, number> =>
  AI_PURPOSES.reduce((acc, k) => { acc[k] = 0; return acc; }, {} as Record<AiPurpose, number>);

function toUsage(raw: unknown): Record<AiPurpose, number> {
  const out = zeroUsage();
  if (raw && typeof raw === "object") {
    for (const k of AI_PURPOSES) {
      const v = (raw as Record<string, unknown>)[k];
      const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
}

/** ภาพรวมโควตาปัจจุบันของ workspace (ใช้ในหน้าแผน/โควตา) */
export const getQuotaSnapshot = cache(async (tenantId: string): Promise<QuotaSnapshot> => {
  const supabase = await createClient();
  const period = currentPeriod();
  const [pool, c] = await Promise.all([getTenantPool(tenantId), db()]);
  const ids = pool.tenantIds;
  const [plan, formsUsed, membersUsed, ai, subs, storage, datasets, datasetApi, webhooks, intakeForms, devices] = await Promise.all([
    getTenantPlan(tenantId),
    countIn("forms", ids, (q) => q.is("deleted_at", null)),
    distinctMembers(ids),
    // ยังไม่รัน 0045 = ใช้ยอดของ workspace นี้ (ยิงพร้อมตัวอื่น ไม่รอก่อน)
    Promise.resolve(c.rpc("ai_usage_pool_all", { p_tenant: tenantId, p_period: period })).then((r) =>
      r.error ? supabase.rpc("ai_usage_all", { p_tenant: tenantId, p_period: period }) : r),
    countIn("submissions", ids, (q) => q.gte("submitted_at", monthStart())),
    Promise.resolve(c.rpc("pool_storage_bytes", { p_tenant: tenantId })).then(async (r) =>
      r.error ? Number((await supabase.rpc("tenant_storage_bytes", { p_tenant: tenantId })).data) || 0 : Number(r.data) || 0, () => 0),
    countIn("datasets", ids),
    countIn("datasets", ids, (q) => q.in("source_kind", ["api_pull", "api_push"])),
    countIn("webhooks", ids),
    countIn("form_intake", ids, (q) => q.eq("enabled", true), "form_id"),
    countIn("devices", ids, (q) => q.eq("status", "approved")),
  ]);
  const aiByPurpose = toUsage(ai.data);
  return {
    plan,
    formsUsed,
    membersUsed,
    aiUsed: AI_PURPOSES.reduce((n, k) => n + aiByPurpose[k], 0),
    aiByPurpose,
    period,
    workspaces: ids.length,
    ownerId: pool.ownerId,
    submissionsMonth: subs,
    storageBytes: storage,
    datasets,
    datasetApi,
    webhooks,
    intakeForms,
    devices,
  };
});

/** ตรวจว่ายังสร้างฟอร์มเพิ่มได้ไหม (นับรวมทุก workspace ของเจ้าของ) */
export async function canAddForm(tenantId: string): Promise<{ ok: boolean; used: number; max: number }> {
  const [plan, pool] = await Promise.all([getTenantPlan(tenantId), getTenantPool(tenantId)]);
  const used = await countIn("forms", pool.tenantIds, (q) => q.is("deleted_at", null));
  return { ok: used < plan.maxForms, used, max: plan.maxForms };
}

/**
 * ตรวจว่ายังเชิญสมาชิกเพิ่มได้ไหม — นับคนไม่ซ้ำทุก workspace ของเจ้าของ + คำเชิญที่ยังค้าง (กันเชิญล่วงหน้าเกินโควตา)
 * เชิญคนที่อยู่ใน workspace อื่นของบัญชีอยู่แล้ว / เคยเชิญค้างไว้แล้ว = ไม่เพิ่มยอด → ผ่านเสมอ
 */
export async function canAddMember(tenantId: string, email?: string): Promise<{ ok: boolean; used: number; max: number }> {
  const [plan, pool] = await Promise.all([getTenantPlan(tenantId), getTenantPool(tenantId)]);
  const c = await db();
  const [{ data: mem }, { data: inv }] = await Promise.all([
    c.from("memberships").select("user_id, email").in("tenant_id", pool.tenantIds).limit(50000),
    c.from("invites").select("email").in("tenant_id", pool.tenantIds).is("accepted_at", null).limit(50000),
  ]);
  const members = (mem || []) as { user_id: string; email: string | null }[];
  const memberEmails = new Set(members.map((m) => (m.email || "").toLowerCase()).filter(Boolean));
  const pending = new Set(((inv || []) as { email: string }[]).map((i) => i.email.toLowerCase()).filter((e) => !memberEmails.has(e)));
  const used = new Set(members.map((m) => m.user_id)).size + pending.size;
  const e = email?.trim().toLowerCase();
  if (e && (memberEmails.has(e) || pending.has(e))) return { ok: true, used, max: plan.maxMembers };
  return { ok: used < plan.maxMembers, used, max: plan.maxMembers };
}

export interface CreditResult {
  ok: boolean;
  used: number;
  max: number;
  purpose: AiPurpose;
  label: string;
}

/**
 * ตรวจโควตา AI ของ purpose นั้น + เพิ่มตัวนับ 1 ครั้ง (เรียกก่อนใช้งาน AI)
 * คืน ok:false ถ้าถังของ purpose นั้นเต็มแล้วในเดือนนี้
 *
 * แต่ละ purpose มีถังของตัวเอง — ใช้ doc_extract จนหมด
 * จะไม่ทำให้สร้างฟอร์มด้วย AI ไม่ได้
 *
 * หมายเหตุ: การสแกนบาร์โค้ด/QR ไม่เรียกฟังก์ชันนี้ เพราะทำงานบนเครื่องผู้ใช้
 *          ไม่มี API route และไม่มีต้นทุน
 */
export async function consumeAiCredit(tenantId: string, purpose: AiPurpose): Promise<CreditResult> {
  const supabase = await createClient();
  const plan = await getTenantPlan(tenantId);
  const period = currentPeriod();
  const max = plan.aiCredits[purpose] ?? 0;
  const label = PURPOSE_LABELS[purpose];

  // ทางหลัก (0057): ตรวจ + นับในคำสั่งเดียวแบบล็อก — ยิงพร้อมกันกี่ครั้งก็ไม่เกินโควตา
  const adminTake = getAdminClient();
  if (adminTake) {
    const { data, error } = await adminTake.rpc("ai_credit_take", { p_tenant: tenantId, p_period: period, p_purpose: purpose, p_max: max });
    if (!error && typeof data === "number") {
      return data < 0 ? { ok: false, used: max, max, purpose, label } : { ok: true, used: data, max, purpose, label };
    }
  }

  // ยอดรวมทั้งกลุ่ม workspace ของเจ้าของ (ยังไม่รัน 0045 = ของ workspace นี้)
  let cur = await supabase.rpc("ai_usage_pool_by", { p_tenant: tenantId, p_period: period, p_purpose: purpose });
  if (cur.error) cur = await supabase.rpc("ai_usage_get_by", { p_tenant: tenantId, p_period: period, p_purpose: purpose });
  const used = (cur.data as number | null) ?? 0;
  if (used >= max) return { ok: false, used, max, purpose, label };

  // นับเครดิตด้วย service role (0052 ปิดไม่ให้ผู้ใช้เรียกตรง) · ยังไม่รัน 0052 / ไม่มี admin = ใช้สิทธิ์ผู้ใช้แบบเดิม
  const admin = getAdminClient();
  const inc = admin ? await admin.rpc("ai_usage_incr_by", { p_tenant: tenantId, p_period: period, p_purpose: purpose }) : null;
  if (!inc || inc.error) await supabase.rpc("ai_usage_incr_by", { p_tenant: tenantId, p_period: period, p_purpose: purpose });
  return { ok: true, used: used + 1, max, purpose, label };
}

// ============================================================
// ด่านตรวจสิทธิ์ตามแพ็กเกจ (ฝั่ง server) — ของที่มีอยู่แล้วเกินลิมิต "ใช้ต่อได้" บล็อกเฉพาะการเพิ่มใหม่
// คืน null = ผ่าน · string = ข้อความ error สำหรับแสดงผู้ใช้
// ============================================================
type Gate = Promise<string | null>;

/** ขั้นอนุมัติ: เพิ่มเกินลิมิตไม่ได้ (ฟอร์มเดิมที่มีมากกว่าอยู่แล้วคงไว้ได้ ถ้าไม่ได้เพิ่ม) */
export async function gateApprovalSteps(tenantId: string, steps: number, prevSteps = 0): Gate {
  const plan = await getTenantPlan(tenantId);
  if (steps <= plan.maxApprovalSteps || steps <= prevSteps) return null;
  return quotaError(`แพ็กเกจ ${plan.name} ตั้งขั้นอนุมัติได้สูงสุด ${fmtLimit(plan.maxApprovalSteps)} ขั้น`);
}

/** ฟอร์มกรอกหลายคน (ส่งต่องาน) — เปิดใหม่ไม่ได้ถ้าแพ็กเกจไม่รองรับ */
export async function gateWorkflow(tenantId: string, isWorkflow: boolean, wasWorkflow = false): Gate {
  if (!isWorkflow || wasWorkflow) return null;
  const plan = await getTenantPlan(tenantId);
  return plan.workflow ? null : quotaError(`แพ็กเกจ ${plan.name} ยังใช้ฟอร์มกรอกหลายคน (ส่งต่องานระหว่างทีม) ไม่ได้`);
}

/** แจ้งเตือน LINE/อีเมล — เปิดใหม่ไม่ได้ถ้าแพ็กเกจไม่รองรับ */
export async function gateNotify(tenantId: string, turningOn: boolean): Gate {
  if (!turningOn) return null;
  const plan = await getTenantPlan(tenantId);
  return plan.notify ? null : quotaError(`แพ็กเกจ ${plan.name} ยังใช้การแจ้งเตือน LINE / อีเมลไม่ได้`);
}

/** เพิ่ม webhook ได้อีกไหม */
export async function gateWebhookAdd(tenantId: string): Gate {
  const plan = await getTenantPlan(tenantId);
  if (plan.maxWebhooks >= UNLIMITED) return null;
  if (plan.maxWebhooks <= 0) return quotaError(`แพ็กเกจ ${plan.name} ยังใช้ Webhook ไม่ได้`);
  const used = await countIn("webhooks", (await getTenantPool(tenantId)).tenantIds);
  return used < plan.maxWebhooks ? null : quotaError(`แพ็กเกจ ${plan.name} ตั้ง Webhook ได้สูงสุด ${fmtLimit(plan.maxWebhooks)} เส้น (ใช้ไป ${used} รวมทุก workspace)`);
}

/** เปิด API รับข้อมูลให้ฟอร์มนี้ได้อีกไหม (นับฟอร์มที่เปิดอยู่ ไม่รวมฟอร์มนี้) */
export async function gateIntakeEnable(tenantId: string, formId: string): Gate {
  const plan = await getTenantPlan(tenantId);
  if (plan.maxIntakeForms >= UNLIMITED) return null;
  if (plan.maxIntakeForms <= 0) return quotaError(`แพ็กเกจ ${plan.name} ยังใช้ API รับข้อมูลไม่ได้`);
  const used = await countIn("form_intake", (await getTenantPool(tenantId)).tenantIds, (q) => q.eq("enabled", true).neq("form_id", formId), "form_id");
  return used < plan.maxIntakeForms ? null : quotaError(`แพ็กเกจ ${plan.name} เปิด API รับข้อมูลได้สูงสุด ${fmtLimit(plan.maxIntakeForms)} ฟอร์ม`);
}
