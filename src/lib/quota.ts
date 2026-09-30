import "server-only";
import { createClient } from "@/lib/supabase/server";
import { type Plan, type PlanKey } from "@/lib/plans";
import { getEffectivePlans } from "@/lib/plans-server";
import { AI_PURPOSES, PURPOSE_LABELS, type AiPurpose } from "@/lib/ai-purpose";

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
  const key = (data?.plan as PlanKey) ?? "free";
  return plans[key] ?? plans.free;
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
  const [plan, forms, members, ai] = await Promise.all([
    getTenantPlan(tenantId),
    supabase.from("forms").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).is("deleted_at", null),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.rpc("ai_usage_all", { p_tenant: tenantId, p_period: period }),
  ]);
  const aiByPurpose = toUsage(ai.data);
  return {
    plan,
    formsUsed: forms.count ?? 0,
    membersUsed: members.count ?? 0,
    aiUsed: AI_PURPOSES.reduce((n, k) => n + aiByPurpose[k], 0),
    aiByPurpose,
    period,
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
