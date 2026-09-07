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

interface MembershipRow {
  role: KrokSession["role"];
  role_key: string | null;
  tenant_id: string;
  created_at: string;
  tenants: { name: string } | { name: string }[] | null;
}
function nameOf(row: { tenants: MembershipRow["tenants"] }): string {
  const tn = row.tenants;
  const n = Array.isArray(tn) ? tn[0]?.name : tn?.name;
  return n ?? "องค์กร";
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * fallback: สร้าง bundle จาก query ตรง (memberships + profile + tenant_role)
 * ใช้เมื่อ RPC session_bundle ล้มเหลว — เช่น ยังไม่ได้รัน migration 0023
 * หรือ error ชั่วคราว — กันไม่ให้ผู้ใช้ที่ล็อกอินแล้วกลายเป็น null (ลูป /login)
 */
async function bundleFromQueries(supabase: ServerClient, userId: string, wanted: string | null): Promise<Bundle> {
  const { data: rows } = await supabase
    .from("memberships")
    .select("role, role_key, tenant_id, created_at, tenants(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const list = (rows || []) as MembershipRow[];

  const { data: prof } = await supabase
    .from("profiles")
    .select("platform_role, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  const profile = prof
    ? { platform_role: (prof.platform_role as string) ?? null, avatar_url: (prof.avatar_url as string) ?? null }
    : null;

  const memberships: BundleMembership[] = list.map((m) => ({
    tenant_id: m.tenant_id,
    role: m.role,
    role_key: m.role_key,
    tenant_name: nameOf(m),
    created_at: m.created_at,
  }));

  if (list.length === 0) return { memberships, profile, active: null };

  const active = (wanted && list.find((m) => m.tenant_id === wanted)) || list[0];
  const roleKey = active.role_key || (active.role === "operator" ? "user" : active.role);

  let menus: string[] | null;
  let can_manage: boolean;
  let role_name: string;
  if (roleKey === "owner") {
    menus = null;
    can_manage = true;
    role_name = "owner";
  } else {
    const { data: roleRow } = await supabase
      .from("tenant_roles")
      .select("name, can_manage, menus")
      .eq("tenant_id", active.tenant_id)
      .eq("key", roleKey)
      .maybeSingle();
    menus = roleRow?.menus ? (roleRow.menus as string[]) : ["forms", "dashboard"];
    can_manage = roleRow ? !!roleRow.can_manage : active.role !== "operator";
    role_name = (roleRow?.name as string) || roleKey;
  }

  return {
    memberships,
    profile,
    active: {
      tenant_id: active.tenant_id,
      role: active.role,
      role_key: roleKey,
      tenant_name: nameOf(active),
      role_name,
      can_manage,
      menus,
    },
  };
}

/**
 * ยิง Supabase ครั้งเดียวต่อ request: auth.getUser() + rpc(session_bundle) แบบขนาน
 * (rpc อ่าน auth.uid() จาก JWT ใน cookie จึงไม่ต้องรอ getUser ก่อน)
 * ถ้า RPC ล้มเหลว → fallback ไป query ตรง (ยังใช้งานได้แม้ migration 0023 ยังไม่ถูกรัน)
 * cache() → layout + page + action ใน request เดียวกันใช้ผลลัพธ์ร่วมกัน
 */
const getBundle = cache(async (): Promise<{ user: User; bundle: Bundle } | null> => {
  const supabase = await createClient();
  const store = await cookies();
  const wanted = store.get(WS_COOKIE)?.value ?? null;

  const [{ data: userData }, rpcRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("session_bundle", { p_wanted: wanted }),
  ]);

  const user = userData?.user;
  if (!user) return null;

  // RPC สำเร็จ → ใช้ผลจาก RPC (round-trip เดียว = fast path)
  if (!rpcRes.error && rpcRes.data) {
    return { user, bundle: rpcRes.data as Bundle };
  }

  // RPC ล้มเหลว → degrade อย่างนุ่มนวลด้วย query ตรง (อย่าปล่อยให้เป็น EMPTY = null session)
  if (rpcRes.error) console.error("[krok] session_bundle rpc failed, falling back:", rpcRes.error.message);
  try {
    const bundle = await bundleFromQueries(supabase, user.id, wanted);
    return { user, bundle };
  } catch (e) {
    console.error("[krok] session fallback query failed:", e);
    return { user, bundle: EMPTY_BUNDLE };
  }
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
