import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface KrokSession {
  userId: string;
  email: string;
  tenantId: string;
  tenantName: string;
  role: "owner" | "admin" | "designer" | "operator";
  displayName: string;
}

/**
 * ดึง session ปัจจุบัน + tenant แรกที่ user เป็นสมาชิก
 * คืน null ถ้าไม่ได้ล็อกอินหรือยังไม่มี membership
 */
export async function getSession(): Promise<KrokSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: m } = await supabase
    .from("memberships")
    .select("role, tenant_id, tenants(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!m) return null;

  const tenants = m.tenants as unknown as { name: string } | { name: string }[] | null;
  const tenantName = Array.isArray(tenants) ? tenants[0]?.name : tenants?.name;

  return {
    userId: user.id,
    email: user.email ?? "",
    tenantId: m.tenant_id as string,
    tenantName: tenantName ?? "องค์กร",
    role: m.role as KrokSession["role"],
    displayName:
      (user.user_metadata?.display_name as string) ||
      (user.email ? user.email.split("@")[0] : "ผู้ใช้"),
  };
}

export function canManage(role: KrokSession["role"]) {
  return role === "owner" || role === "admin" || role === "designer";
}
