import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const WS_COOKIE = "krok_ws";

export interface KrokSession {
  userId: string;
  email: string;
  tenantId: string;
  tenantName: string;
  role: "owner" | "admin" | "designer" | "operator";
  displayName: string;
}

export interface WorkspaceItem {
  tenantId: string;
  tenantName: string;
  role: KrokSession["role"];
}

interface MembershipRow {
  role: KrokSession["role"];
  tenant_id: string;
  created_at: string;
  tenants: { name: string } | { name: string }[] | null;
}

function nameOf(row: MembershipRow): string {
  const t = row.tenants;
  const n = Array.isArray(t) ? t[0]?.name : t?.name;
  return n ?? "องค์กร";
}

/**
 * ดึง session ปัจจุบัน + workspace ที่ active (ตาม cookie krok_ws)
 * ถ้า cookie ไม่ตรงกับ membership ใด ๆ → ใช้ workspace แรก
 * คืน null ถ้าไม่ได้ล็อกอินหรือยังไม่มี membership
 */
export async function getSession(): Promise<KrokSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from("memberships")
    .select("role, tenant_id, created_at, tenants(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const list = (rows || []) as MembershipRow[];
  if (list.length === 0) return null;

  const store = await cookies();
  const wanted = store.get(WS_COOKIE)?.value;
  const active = (wanted && list.find((m) => m.tenant_id === wanted)) || list[0];

  return {
    userId: user.id,
    email: user.email ?? "",
    tenantId: active.tenant_id,
    tenantName: nameOf(active),
    role: active.role,
    displayName:
      (user.user_metadata?.display_name as string) ||
      (user.email ? user.email.split("@")[0] : "ผู้ใช้"),
  };
}

/** รายชื่อ workspace ทั้งหมดที่ผู้ใช้ปัจจุบันเป็นสมาชิก (เรียงตามเวลาที่เข้าร่วม) */
export async function listWorkspaces(): Promise<WorkspaceItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows } = await supabase
    .from("memberships")
    .select("role, tenant_id, created_at, tenants(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return ((rows || []) as MembershipRow[]).map((m) => ({
    tenantId: m.tenant_id,
    tenantName: nameOf(m),
    role: m.role,
  }));
}

export function canManage(role: KrokSession["role"]) {
  return role === "owner" || role === "admin" || role === "designer";
}
