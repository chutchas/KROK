"use server";
import { sm } from "@/lib/server-msg";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { getEffectivePlans } from "@/lib/plans-server";

type PlatformRole = "platform_admin" | "developer" | "user";
const PLATFORM_ROLES: PlatformRole[] = ["platform_admin", "developer", "user"];

async function requirePlatform() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "unauthorized" };
  if (!session.isPlatformAdmin) return { ok: false as const, error: await sm("เฉพาะ admin ของระบบเท่านั้น") };
  const admin = getAdminClient();
  if (!admin) return { ok: false as const, error: await sm("ระบบยังไม่ได้ตั้งค่า service key") };
  return { ok: true as const, session, admin };
}

export async function setPlatformRole(userId: string, role: PlatformRole): Promise<{ ok: true } | { error: string }> {
  const a = await requirePlatform();
  if (!a.ok) return { error: a.error };
  if (!PLATFORM_ROLES.includes(role)) return { error: await sm("role ไม่ถูกต้อง") };
  if (userId === a.session.userId && role !== "platform_admin")
    return { error: await sm("ถอดสิทธิ์ platform admin ของตัวเองไม่ได้") };

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
  if (isOnlyOwner) return { error: await sm("ลบ owner คนสุดท้ายของ workspace ไม่ได้") };

  const { error } = await a.admin.from("memberships").delete().eq("user_id", userId).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * กำหนดแพ็กเกจของบัญชีผู้ใช้ (Platform Admin) — มีผลทันทีกับทุก workspace ที่ผู้ใช้นี้เป็นเจ้าของ
 * กำหนดแพ็กเกจที่ซ่อนอยู่ได้ (ดีลพิเศษ) · ไม่ออกใบแจ้งหนี้ · บันทึกลงประวัติของแต่ละ workspace
 */
export async function setUserPlan(userId: string, plan: string): Promise<{ ok: true } | { error: string }> {
  const a = await requirePlatform();
  if (!a.ok) return { error: a.error };
  const plans = await getEffectivePlans();
  if (typeof plan !== "string" || !plans[plan]) return { error: await sm("ไม่พบแพ็กเกจนี้") };

  const { data: cur, error: readErr } = await a.admin.from("account_plans").select("plan").eq("user_id", userId).maybeSingle();
  if (readErr) return { error: /account_plans/.test(readErr.message) ? "ต้องรัน migration 0045_account_plans ก่อน" : readErr.message };
  const from = (cur?.plan as string) || "free";
  if (from === plan) return { ok: true };

  // แอดมินกำหนด = ไม่มีวันหมดอายุ (ดีลพิเศษ/แก้ไขให้ลูกค้า) · ยังไม่รัน 0046 (ไม่มีคอลัมน์) = บันทึกแบบเดิม
  // และหยุดตัดเงินอัตโนมัติ (ไม่ให้ตัดบัตรลูกค้าทับดีลที่แอดมินกำหนด)
  const row: Record<string, unknown> = { user_id: userId, plan, expires_at: null, auto_renew: false, updated_at: new Date().toISOString(), updated_by: a.session.userId };
  let { error } = await a.admin.from("account_plans").upsert(row, { onConflict: "user_id" });
  for (const col of ["auto_renew", "expires_at"]) {
    if (error && new RegExp(col).test(error.message)) {
      delete row[col];
      ({ error } = await a.admin.from("account_plans").upsert(row, { onConflict: "user_id" }));
    }
  }
  if (error) return { error: error.message };

  // สำเนาที่ tenants.plan + ประวัติของทุก workspace ที่เป็นเจ้าของ
  const { data: owned } = await a.admin.rpc("owner_tenant_ids", { p_owner: userId });
  const ids = Array.isArray(owned) ? (owned as string[]) : [];
  if (ids.length) {
    await a.admin.from("tenants").update({ plan }).in("id", ids);
    await a.admin.from("audit_log").insert(ids.map((tid) => ({
      tenant_id: tid, actor_id: a.session.userId, action: "plan.change", target_type: "tenant", target_id: tid,
      meta: { plan, from, by: "platform_admin", account: userId },
    })));
  }
  revalidatePath("/admin/users");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** รีเซ็ต 2FA ของผู้ใช้ (ทำมือถือหาย) — ลบ factor ทั้งหมด ผู้ใช้กลับไปใช้รหัสผ่านอย่างเดียวจนกว่าจะเปิดใหม่ */
export async function resetUserMfa(userId: string): Promise<{ ok: true; removed: number } | { error: string }> {
  const a = await requirePlatform();
  if (!a.ok) return { error: a.error };
  const { data, error } = await a.admin.auth.admin.mfa.listFactors({ userId });
  if (error) return { error: error.message };
  let removed = 0;
  for (const f of data?.factors ?? []) {
    const { error: delErr } = await a.admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    if (delErr) return { error: delErr.message };
    removed++;
  }
  await a.admin.from("audit_log").insert({
    tenant_id: null, actor_id: a.session.userId, action: "user.mfa_reset", target_type: "user", target_id: userId, meta: { removed },
  });
  return { ok: true, removed };
}
