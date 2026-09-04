import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPlan, type Plan } from "@/lib/plans";

export function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** อ่าน plan ของ tenant (คืน 'free' ถ้าไม่พบ) */
export async function getTenantPlan(tenantId: string): Promise<Plan> {
  const supabase = await createClient();
  const { data } = await supabase.from("tenants").select("plan").eq("id", tenantId).maybeSingle();
  return getPlan((data?.plan as string) ?? "free");
}

export interface QuotaSnapshot {
  plan: Plan;
  formsUsed: number;
  membersUsed: number;
  aiUsed: number;
  period: string;
}

/** ภาพรวมโควตาปัจจุบันของ workspace (ใช้ในหน้าแผน/โควตา) */
export async function getQuotaSnapshot(tenantId: string): Promise<QuotaSnapshot> {
  const supabase = await createClient();
  const period = currentPeriod();
  const [plan, forms, members, ai] = await Promise.all([
    getTenantPlan(tenantId),
    supabase.from("forms").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).is("deleted_at", null),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.rpc("ai_usage_get", { p_tenant: tenantId, p_period: period }),
  ]);
  return {
    plan,
    formsUsed: forms.count ?? 0,
    membersUsed: members.count ?? 0,
    aiUsed: (ai.data as number | null) ?? 0,
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

/**
 * ตรวจโควตา AI + เพิ่มตัวนับ 1 ครั้ง (เรียกก่อนใช้งาน AI)
 * คืน ok:false ถ้าเกินโควตาเดือนนี้
 */
export async function consumeAiCredit(tenantId: string): Promise<{ ok: boolean; used: number; max: number }> {
  const supabase = await createClient();
  const plan = await getTenantPlan(tenantId);
  const period = currentPeriod();
  const { data: cur } = await supabase.rpc("ai_usage_get", { p_tenant: tenantId, p_period: period });
  const used = (cur as number | null) ?? 0;
  if (used >= plan.aiCreditsPerMonth) return { ok: false, used, max: plan.aiCreditsPerMonth };
  const { data: next } = await supabase.rpc("ai_usage_incr", { p_tenant: tenantId, p_period: period });
  return { ok: true, used: (next as number | null) ?? used + 1, max: plan.aiCreditsPerMonth };
}
