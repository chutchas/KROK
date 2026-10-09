import { redirect } from "next/navigation";
import { getSession, redirectNoSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import AdminUsersClient, { type SysUser } from "./AdminUsersClient";
import { getPlanCatalog } from "@/lib/plans-server";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) return redirectNoSession();
  if (!session.isPlatformAdmin)
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ admin ของระบบเท่านั้น</div>;

  const admin = getAdminClient();
  if (!admin)
    return <div style={{ color: "var(--fail)" }}>ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY บน server</div>;

  const [{ data: members }, { data: tenants }, { data: profiles }, catalog] = await Promise.all([
    admin.from("memberships").select("user_id, tenant_id, role, role_key, name, email, created_at"),
    admin.from("tenants").select("id, name, plan, created_by"),
    admin.from("profiles").select("user_id, first_name, last_name, platform_role"),
    getPlanCatalog(),
  ]);
  const { data: acct, error: acctErr } = await admin.from("account_plans").select("user_id, plan");
  const userPlan = new Map(((acct || []) as { user_id: string; plan: string }[]).map((r) => [r.user_id, r.plan]));
  const tenantRows = (tenants || []) as { id: string; plan: string | null; created_by: string | null }[];
  const memberRows = (members || []) as { user_id: string; tenant_id: string; role: string; created_at: string }[];
  // เจ้าของบัญชี (billing owner) ของแต่ละ workspace — กติกาเดียวกับ public.tenant_billing_owner (0045)
  const billingOwner = new Map<string, string>();
  for (const t of tenantRows) {
    const owners = memberRows.filter((m) => m.tenant_id === t.id && m.role === "owner").sort((x, y) => x.created_at.localeCompare(y.created_at));
    const o = t.created_by && owners.some((m) => m.user_id === t.created_by) ? t.created_by : owners[0]?.user_id ?? t.created_by;
    if (o) billingOwner.set(t.id, o);
  }
  // ยังไม่รัน 0045 → แพ็กเกจของบัญชี = แพ็กเกจของ workspace ที่เป็นเจ้าของ (ตัวแรก)
  const tPlan = new Map(tenantRows.map((t) => [t.id, t.plan || "free"]));
  const planOfUser = (uid: string) => {
    if (!acctErr) return userPlan.get(uid) || "free";
    const own = tenantRows.find((t) => billingOwner.get(t.id) === uid);
    return own ? tPlan.get(own.id) || "free" : "free";
  };

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
        plan: planOfUser(m.user_id),
        workspaces: [],
        createdAt: m.created_at,
      };
      byUser.set(m.user_id, u);
    }
    u.workspaces.push({ tenantId: m.tenant_id, tenantName: tName.get(m.tenant_id) || "—", role: m.role, roleKey: m.role_key || m.role, billing: billingOwner.get(m.tenant_id) === m.user_id });
  }
  // profiles ที่ไม่มี membership (เผื่อมี)
  for (const p of (profiles || []) as { user_id: string; first_name: string | null; last_name: string | null; platform_role: string }[]) {
    if (!byUser.has(p.user_id)) {
      byUser.set(p.user_id, {
        userId: p.user_id,
        name: [p.first_name, p.last_name].filter(Boolean).join(" "),
        email: "",
        platformRole: (p.platform_role as SysUser["platformRole"]) || "user",
        plan: planOfUser(p.user_id),
        workspaces: [],
        createdAt: "",
      });
    }
  }

  const users = Array.from(byUser.values()).sort((a, b) => (a.email || "").localeCompare(b.email || ""));

  const plans = catalog.map((p) => ({ key: p.key, name: p.name, priceThb: p.priceThb, visible: p.visible }));
  return <AdminUsersClient users={users} meId={session.userId} plans={plans} />;
}
