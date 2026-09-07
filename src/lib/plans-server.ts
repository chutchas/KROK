import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { effectivePlans, type PlanOverrides, type Plan, type PlanKey } from "@/lib/plans";

// อ่านค่า override ราคา/โควตาจาก DB (ว่าง = ใช้ค่า default ในโค้ด) — cache ต่อ request
export const loadPlanOverrides = cache(async (): Promise<PlanOverrides> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_plan_settings")
    .select("plans")
    .eq("id", true)
    .maybeSingle();
  return (data?.plans as PlanOverrides) ?? {};
});

export const getEffectivePlans = cache(async (): Promise<Record<PlanKey, Plan>> => {
  return effectivePlans(await loadPlanOverrides());
});
