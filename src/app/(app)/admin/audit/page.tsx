import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import AuditAdminClient, { type AuditRow, type Facet } from "./AuditAdminClient";

export const dynamic = "force-dynamic";

type SP = { [k: string]: string | string[] | undefined };

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isPlatformAdmin)
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ Platform Admin เท่านั้น</div>;

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
  const fTenant = one(sp.tenant);
  const fActor = one(sp.actor);
  const fForm = one(sp.form);
  const fAction = one(sp.action);

  const admin = getAdminClient();
  if (!admin)
    return <div style={{ color: "var(--fail)" }}>ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY ฝั่ง server</div>;

  // ตัวเลือกฟิลเตอร์
  const [tenantsR, membersR, formsR] = await Promise.all([
    admin.from("tenants").select("id, name").order("name"),
    admin.from("memberships").select("user_id, name, email, tenant_id"),
    admin.from("forms").select("id, title, tenant_id").is("deleted_at", null).order("title").limit(1000),
  ]);
  const tenants = (tenantsR.data || []) as { id: string; name: string }[];
  const members = (membersR.data || []) as { user_id: string; name: string | null; email: string | null; tenant_id: string }[];
  const forms = (formsR.data || []) as { id: string; title: string; tenant_id: string }[];

  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
  const actorName = new Map<string, string>();
  for (const m of members) if (!actorName.has(m.user_id)) actorName.set(m.user_id, m.name || m.email || m.user_id.slice(0, 8));
  const formTitle = new Map(forms.map((f) => [f.id, f.title]));

  // แถว audit ตามฟิลเตอร์
  let q = admin.from("audit_log").select("id, tenant_id, actor_id, action, target_type, target_id, meta, created_at")
    .order("created_at", { ascending: false }).limit(300);
  if (fTenant) q = q.eq("tenant_id", fTenant);
  if (fActor) q = q.eq("actor_id", fActor);
  if (fAction) q = q.eq("action", fAction);
  if (fForm) q = q.eq("target_id", fForm);
  const { data: rowsRaw } = await q;

  const rows: AuditRow[] = ((rowsRaw || []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    created_at: String(r.created_at),
    tenant_id: (r.tenant_id as string) || null,
    tenant_name: r.tenant_id ? tenantName.get(r.tenant_id as string) || "—" : "ระบบ",
    actor_id: (r.actor_id as string) || null,
    actor_name: r.actor_id ? actorName.get(r.actor_id as string) || String(r.actor_id).slice(0, 8) : "—",
    action: String(r.action),
    target_type: (r.target_type as string) || "",
    target_id: (r.target_id as string) || "",
    target_label:
      r.target_type === "form" && r.target_id ? formTitle.get(r.target_id as string) || "" : "",
    meta: (r.meta as Record<string, unknown>) || {},
  }));

  // ตัวเลือก action ที่พบจริง (จากแถวที่ดึงมา) + ชุดมาตรฐาน
  const actionSet = new Set<string>(rows.map((r) => r.action));
  const actions = Array.from(actionSet).sort();

  const facets: Facet = {
    tenants: tenants.map((t) => ({ id: t.id, label: t.name })),
    users: Array.from(actorName.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 500),
    forms: forms
      .filter((f) => !fTenant || f.tenant_id === fTenant)
      .map((f) => ({ id: f.id, label: f.title })),
    actions,
  };

  return (
    <AuditAdminClient rows={rows} facets={facets} filters={{ tenant: fTenant, actor: fActor, form: fForm, action: fAction }} />
  );
}
