import "server-only";
import { createClient } from "@/lib/supabase/server";
import { effectivePlans, type PlanOverrides, type Plan, type PlanKey } from "@/lib/plans";

// อ่านค่า override ราคา/โควตาจาก DB (ว่าง = ใช้ค่า default ในโค้ด)
export async function loadPlanOverrides(): Promise<PlanOverrides> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_plan_settings")
    .select("plans")
    .eq("id", true)
    .maybeSingle();
  return (data?.plans as PlanOverrides) ?? {};
}

export async function getEffectivePlans(): Promise<Record<PlanKey, Plan>> {
  return effectivePlans(await loadPlanOverrides());
}
