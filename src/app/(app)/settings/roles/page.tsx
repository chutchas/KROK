import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import RolesClient, { type RoleRow } from "./RolesClient";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "admin")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin เท่านั้น</div>;

  const supabase = await createClient();
  const [{ data: roles }, { data: members }] = await Promise.all([
    supabase.from("tenant_roles").select("key, name, can_manage, menus, is_system, sort").eq("tenant_id", session.tenantId).order("sort", { ascending: true }),
    supabase.from("memberships").select("role_key").eq("tenant_id", session.tenantId),
  ]);

  const counts: Record<string, number> = {};
  for (const m of (members || []) as { role_key: string | null }[]) {
    const k = m.role_key || "user";
    counts[k] = (counts[k] || 0) + 1;
  }

  const rows: RoleRow[] = ((roles || []) as { key: string; name: string; can_manage: boolean; menus: string[]; is_system: boolean }[]).map((r) => ({
    key: r.key,
    name: r.name,
    canManage: r.can_manage,
    menus: (r.menus as string[]) || [],
    isSystem: r.is_system,
    memberCount: counts[r.key] || 0,
  }));

  return <RolesClient roles={rows} />;
}
