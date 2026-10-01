import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { normalizeCatalog, catalogRecord, type Plan, type PlanKey } from "@/lib/plans";

/** ข้อมูลดิบของแคตตาล็อกใน DB (ว่าง/อ่านไม่ได้ = ใช้ค่าเริ่มต้นในโค้ด) — cache ต่อ request */
export const loadPlanCatalogRaw = cache(async (): Promise<unknown> => {
  // ราคาไม่ใช่ความลับ: ใช้ client ปกติ (anon/ผู้ใช้อ่านได้ — 0044) · อ่านไม่ได้ (ยังไม่รัน 0044 และยังไม่ล็อกอิน) → service role
  const supabase = await createClient();
  const { data, error } = await supabase.from("platform_plan_settings").select("plans").eq("id", true).maybeSingle();
  if (!error && data) return data.plans;
  const admin = getAdminClient();
  if (!admin) return {};
  const res = await admin.from("platform_plan_settings").select("plans").eq("id", true).maybeSingle();
  return res.data?.plans ?? {};
});

/** ทุกแพ็กเกจ (รวมที่ซ่อน) เรียงตามลำดับ */
export const getPlanCatalog = cache(async (): Promise<Plan[]> => normalizeCatalog(await loadPlanCatalogRaw()));

/** แพ็กเกจที่แสดงให้ลูกค้าเห็น (หน้า home / หน้าแผน) */
export const getPublicPlans = cache(async (): Promise<Plan[]> => (await getPlanCatalog()).filter((p) => p.visible));

export const getEffectivePlans = cache(async (): Promise<Record<PlanKey, Plan>> => catalogRecord(await getPlanCatalog()));
