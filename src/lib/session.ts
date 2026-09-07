import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { MenuKey } from "@/lib/menus";

export const WS_COOKIE = "krok_ws";

export interface KrokSession {
  userId: string;
  email: string;
  tenantId: string;
  tenantName: string;
  role: "owner" | "admin" | "designer" | "operator";
  roleKey: string;
  roleName: string;
  canManageWs: boolean;
  displayName: string;
  avatarUrl: string;
  platformRole: "platform_admin" | "developer" | "user";
  isPlatformAdmin: boolean;
}

export interface WorkspaceItem {
  tenantId: string;
  tenantName: string;
  role: KrokSession["role"];
}

// รูปแบบ jsonb ที่ RPC session_bundle คืน (ดู supabase/migrations/0023_session_bundle.sql)
interface BundleMembership {
  tenant_id: string;
  role: KrokSession["role"];
  role_key: string | null;
  tenant_name: string;
  created_at: string;
}
interface Bundle {
  memberships: BundleMembership[];
  profile: { platform_role: string | null; avatar_url: string | null } | null;
  active: {
    tenant_id: string;
    role: KrokSession["role"];
    role_key: string;
    tenant_name: string;
    role_name: string;
    can_manage: boolean;
    menus: string[] | null; // null = ทุกเมนู (owner)
  } | null;
}

const EMPTY_BUNDLE: Bundle = { memberships: [], profile: null, active: null };

/**
 * ยิง Supabase ครั้งเดียวต่อ request: auth.getUser() + rpc(session_bundle) แบบขนาน
 * (rpc อ่าน auth.uid() จาก JWT ใน cookie จึงไม่ต้องรอ getUser ก่อน)
 * cache() → layout + page + action ใน request เดียวกันใช้ผลลัพธ์ร่วมกัน
 */
const getBundle = cache(async (): Promise<{ user: User; bundle: Bundle } | null> => {
  const supabase = await createClient();
  const store = await cookies();
  const wanted = store.get(WS_COOKIE)?.value ?? null;

  const [{ data: userData }, { data: bundleData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("session_bundle", { p_wanted: wanted }),
  ]);

  const user = userData?.user;
  if (!user) return null;
  return { user, bundle: (bundleData as Bundle | null) ?? EMPTY_BUNDLE };
});

/**
 * ดึง session ปัจจุบัน + workspace ที่ active (ตาม cookie krok_ws)
 * คืน null ถ้าไม่ได้ล็อกอินหรือยังไม่มี membership
 */
export const getSession = cache(async (): Promise<KrokSession | null> => {
  const res = await getBundle();
  if (!res) return null;
  const { user, bundle } = res;
  const a = bundle.active;
  if (!a) return null;

  const platformRole = ((bundle.profile?.platform_role as string) ?? "user") as KrokSession["platformRole"];

  return {
    userId: user.id,
    email: user.email ?? "",
    tenantId: a.tenant_id,
    tenantName: a.tenant_name,
    role: a.role,
    roleKey: a.role_key,
    roleName: a.role_name,
    canManageWs: a.can_manage,
    displayName:
      (user.user_metadata?.display_name as string) ||
      (user.email ? user.email.split("@")[0] : "ผู้ใช้"),
    avatarUrl: (bundle.profile?.avatar_url as string) || (user.user_metadata?.avatar_url as string) || "",
    platformRole,
    isPlatformAdmin: platformRole === "platform_admin",
  };
});

/** สิทธิ์เมนูของ role ปัจจุบันใน workspace (owner = ทุกเมนู) */
export const getAllowedMenus = cache(async (
  tenantId: string,
  roleKey: string
): Promise<MenuKey[]> => {
  const { ALL_MENU_KEYS, cleanMenus } = await import("@/lib/menus");
  if (roleKey === "owner") return ALL_MENU_KEYS;

  // fast path: ถ้าถามถึง workspace ที่ active อยู่ → ใช้ menus จาก bundle (ไม่ยิงเพิ่ม)
  const res = await getBundle();
  const a = res?.bundle.active;
  if (a && a.tenant_id === tenantId && a.role_key === roleKey) {
    return a.menus === null ? ALL_MENU_KEYS : cleanMenus(a.menus);
  }

  // fallback: workspace อื่น (พบไม่บ่อย) → query ตรง
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_roles")
    .select("menus")
    .eq("tenant_id", tenantId)
    .eq("key", roleKey)
    .maybeSingle();
  if (!data) return ["forms", "dashboard"];
  return cleanMenus(data.menus);
});

/** รายชื่อ workspace ทั้งหมดที่ผู้ใช้ปัจจุบันเป็นสมาชิก (เรียงตามเวลาที่เข้าร่วม) */
export async function listWorkspaces(): Promise<WorkspaceItem[]> {
  const res = await getBundle();
  if (!res) return [];
  return res.bundle.memberships.map((m) => ({
    tenantId: m.tenant_id,
    tenantName: m.tenant_name,
    role: m.role,
  }));
}

export function canManage(role: KrokSession["role"]) {
  return role === "owner" || role === "admin" || role === "designer";
}

/**
 * บังคับสิทธิ์ระดับหน้า: ต้องมี menu นี้ใน allowedMenus ของ role ปัจจุบัน
 * ถ้าไม่มี → redirect ไปหน้าที่เข้าได้หน้าแรก (กัน loop) หรือหน้าโปรไฟล์
 * คืน session เมื่อผ่าน
 */
export async function enforceMenu(menu: MenuKey): Promise<KrokSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  const allowed = await getAllowedMenus(session.tenantId, session.roleKey);
  if (allowed.includes(menu)) return session;
  const { MENUS } = await import("@/lib/menus");
  const first = MENUS.find((m) => allowed.includes(m.key));
  redirect(first ? first.href : "/settings/profile");
}
