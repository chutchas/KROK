import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import AdminUsersClient, { type SysUser } from "./AdminUsersClient";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isPlatformAdmin)
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ admin ของระบบเท่านั้น</div>;

  const admin = getAdminClient();
  if (!admin)
    return <div style={{ color: "var(--fail)" }}>ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY บน server</div>;

  const [{ data: members }, { data: tenants }, { data: profiles }] = await Promise.all([
    admin.from("memberships").select("user_id, tenant_id, role, role_key, name, email, created_at"),
    admin.from("tenants").select("id, name"),
    admin.from("profiles").select("user_id, first_name, last_name, platform_role"),
  ]);

  const tName = new Map(((tenants || []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));
  const profMap = new Map(
    ((profiles || []) as { user_id: string; first_name: string | null; last_name: string | null; platform_role: string }[]).map((p) => [p.user_id, p])
  );

  const byUser = new Map<string, SysUser>();
  for (const m of (members || []) as { user_id: string; tenant_id: string; role: string; role_key: string | null; name: string | null; email: string | null; created_at: string }[]) {
    let u = byUser.get(m.user_id);
    if (!u) {
      const p = profMap.get(m.user_id);
      const pname = p ? [p.first_name, p.last_name].filter(Boolean).join(" ") : "";
      u = {
        userId: m.user_id,
        name: pname || m.name || "",
        email: m.email || "",
        platformRole: (p?.platform_role as SysUser["platformRole"]) || "user",
        workspaces: [],
        createdAt: m.created_at,
      };
      byUser.set(m.user_id, u);
    }
    u.workspaces.push({ tenantId: m.tenant_id, tenantName: tName.get(m.tenant_id) || "—", role: m.role, roleKey: m.role_key || m.role });
  }
  // profiles ที่ไม่มี membership (เผื่อมี)
  for (const p of (profiles || []) as { user_id: string; first_name: string | null; last_name: string | null; platform_role: string }[]) {
    if (!byUser.has(p.user_id)) {
      byUser.set(p.user_id, {
        userId: p.user_id,
        name: [p.first_name, p.last_name].filter(Boolean).join(" "),
        email: "",
        platformRole: (p.platform_role as SysUser["platformRole"]) || "user",
        workspaces: [],
        createdAt: "",
      });
    }
  }

  const users = Array.from(byUser.values()).sort((a, b) => (a.email || "").localeCompare(b.email || ""));

  return <AdminUsersClient users={users} meId={session.userId} />;
}
