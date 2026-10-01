"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { getEffectivePlans } from "@/lib/plans-server";

type PlatformRole = "platform_admin" | "developer" | "user";
const PLATFORM_ROLES: PlatformRole[] = ["platform_admin", "developer", "user"];

async function requirePlatform() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "unauthorized" };
  if (!session.isPlatformAdmin) return { ok: false as const, error: "เฉพาะ admin ของระบบเท่านั้น" };
  const admin = getAdminClient();
  if (!admin) return { ok: false as const, error: "ระบบยังไม่ได้ตั้งค่า service key" };
  return { ok: true as const, session, admin };
}

export async function setPlatformRole(userId: string, role: PlatformRole): Promise<{ ok: true } | { error: string }> {
  const a = await requirePlatform();
  if (!a.ok) return { error: a.error };
  if (!PLATFORM_ROLES.includes(role)) return { error: "role ไม่ถูกต้อง" };
  if (userId === a.session.userId && role !== "platform_admin")
    return { error: "ถอดสิทธิ์ platform admin ของตัวเองไม่ได้" };

  const { error } = await a.admin.from("profiles").update({ platform_role: role }).eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function removeFromWorkspace(userId: string, tenantId: string): Promise<{ ok: true } | { error: string }> {
  const a = await requirePlatform();
  if (!a.ok) return { error: a.error };

  const { data: owners } = await a.admin
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner");
  const isOnlyOwner = (owners || []).length <= 1 && (owners || []).some((o) => o.user_id === userId);
  if (isOnlyOwner) return { error: "ลบ owner คนสุดท้ายของ workspace ไม่ได้" };

  const { error } = await a.admin.from("memberships").delete().eq("user_id", userId).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * กำหนดแพ็กเกจของ workspace (Platform Admin) — มีผลทันทีกับทุกสมาชิกใน workspace นั้น
 * กำหนดแพ็กเกจที่ซ่อนอยู่ได้ (ดีลพิเศษ) · ไม่ออกใบแจ้งหนี้ · บันทึกลงประวัติของ workspace
 */
export async function setTenantPlan(tenantId: string, plan: string): Promise<{ ok: true } | { error: string }> {
  const a = await requirePlatform();
  if (!a.ok) return { error: a.error };
  const plans = await getEffectivePlans();
  if (typeof plan !== "string" || !plans[plan]) return { error: "ไม่พบแพ็กเกจนี้" };

  const { data: cur } = await a.admin.from("tenants").select("plan").eq("id", tenantId).maybeSingle();
  if (!cur) return { error: "ไม่พบ workspace" };
  if (cur.plan === plan) return { ok: true };

  const { error } = await a.admin.from("tenants").update({ plan }).eq("id", tenantId);
  if (error) return { error: error.message };
  await a.admin.from("audit_log").insert({
    tenant_id: tenantId,
    actor_id: a.session.userId,
    action: "plan.change",
    target_type: "tenant",
    target_id: tenantId,
    meta: { plan, from: cur.plan, by: "platform_admin" },
  });
  revalidatePath("/admin/users");
  revalidatePath("/", "layout");
  return { ok: true };
}
