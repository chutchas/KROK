import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPlan, fmtLimit, UNLIMITED, type Plan } from "@/lib/plans";
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

/** อ่าน plan ของ tenant (คืน 'free' ถ้าไม่พบ) — ใช้ราคา/โควตาที่ override จากตั้งค่าระบบ */
export async function getTenantPlan(tenantId: string): Promise<Plan> {
  const supabase = await createClient();
  const [{ data }, plans] = await Promise.all([
    supabase.from("tenants").select("plan").eq("id", tenantId).maybeSingle(),
    getEffectivePlans(),
  ]);
  return getPlan(data?.plan as string | undefined, plans);
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
export async function getQuotaSnapshot(tenantId: string): Promise<QuotaSnapshot> {
  const supabase = await createClient();
  const period = currentPeriod();
  // ตารางที่มีความลับ (webhooks/form_intake) ปิด REST แล้ว → นับด้วย service role (ผูก tenant เอง)
  const db = getAdminClient() ?? supabase;
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0, () => 0);
  const [plan, forms, members, ai, subs, storage, datasets, datasetApi, webhooks, intakeForms, devices] = await Promise.all([
    getTenantPlan(tenantId),
    supabase.from("forms").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).is("deleted_at", null),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.rpc("ai_usage_all", { p_tenant: tenantId, p_period: period }),
    count(supabase.from("submissions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("submitted_at", monthStart())),
    Promise.resolve(supabase.rpc("tenant_storage_bytes", { p_tenant: tenantId })).then((r) => (typeof r.data === "number" ? r.data : Number(r.data) || 0), () => 0),
    count(supabase.from("datasets").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)),
    count(supabase.from("datasets").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("source_kind", ["api_pull", "api_push"])),
    count(db.from("webhooks").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)),
    count(db.from("form_intake").select("form_id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("enabled", true)),
    count(db.from("devices").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "approved")),
  ]);
  const aiByPurpose = toUsage(ai.data);
  return {
    plan,
    formsUsed: forms.count ?? 0,
    membersUsed: members.count ?? 0,
    aiUsed: AI_PURPOSES.reduce((n, k) => n + aiByPurpose[k], 0),
    aiByPurpose,
    period,
    submissionsMonth: subs,
    storageBytes: storage,
    datasets,
    datasetApi,
    webhooks,
    intakeForms,
    devices,
  };
}

/** ตรวจว่ายังสร้างฟอร์มเพิ่มได้ไหมตามแผน */
export async function canAddForm(tenantId: string): Promise<{ ok: boolean; used: number; max: number }> {
  const supabase = await createClient();
  const plan = await getTenantPlan(tenantId);
  const { count } = await supabase
    .from("forms").select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId).is("deleted_at", null);
  const used = count ?? 0;
  return { ok: used < plan.maxForms, used, max: plan.maxForms };
}

/** ตรวจว่ายังเชิญสมาชิกเพิ่มได้ไหม */
export async function canAddMember(tenantId: string): Promise<{ ok: boolean; used: number; max: number }> {
  const supabase = await createClient();
  const plan = await getTenantPlan(tenantId);
  const { count } = await supabase
    .from("memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  const used = count ?? 0;
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

  const { data: cur } = await supabase.rpc("ai_usage_get_by", {
    p_tenant: tenantId, p_period: period, p_purpose: purpose,
  });
  const used = (cur as number | null) ?? 0;
  if (used >= max) return { ok: false, used, max, purpose, label };

  const { data: next } = await supabase.rpc("ai_usage_incr_by", {
    p_tenant: tenantId, p_period: period, p_purpose: purpose,
  });
  return { ok: true, used: (next as number | null) ?? used + 1, max, purpose, label };
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

async function countVia(table: string, tenantId: string, extra?: (q: any) => any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const db = getAdminClient() ?? (await createClient());
  let q = db.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (extra) q = extra(q);
  const { count } = await q;
  return count ?? 0;
}

/** เพิ่ม webhook ได้อีกไหม */
export async function gateWebhookAdd(tenantId: string): Gate {
  const plan = await getTenantPlan(tenantId);
  if (plan.maxWebhooks >= UNLIMITED) return null;
  if (plan.maxWebhooks <= 0) return quotaError(`แพ็กเกจ ${plan.name} ยังใช้ Webhook ไม่ได้`);
  const used = await countVia("webhooks", tenantId);
  return used < plan.maxWebhooks ? null : quotaError(`แพ็กเกจ ${plan.name} ตั้ง Webhook ได้สูงสุด ${fmtLimit(plan.maxWebhooks)} เส้น (ใช้ไป ${used})`);
}

/** เปิด API รับข้อมูลให้ฟอร์มนี้ได้อีกไหม (นับฟอร์มที่เปิดอยู่ ไม่รวมฟอร์มนี้) */
export async function gateIntakeEnable(tenantId: string, formId: string): Gate {
  const plan = await getTenantPlan(tenantId);
  if (plan.maxIntakeForms >= UNLIMITED) return null;
  if (plan.maxIntakeForms <= 0) return quotaError(`แพ็กเกจ ${plan.name} ยังใช้ API รับข้อมูลไม่ได้`);
  const used = await countVia("form_intake", tenantId, (q) => q.eq("enabled", true).neq("form_id", formId));
  return used < plan.maxIntakeForms ? null : quotaError(`แพ็กเกจ ${plan.name} เปิด API รับข้อมูลได้สูงสุด ${fmtLimit(plan.maxIntakeForms)} ฟอร์ม`);
}
