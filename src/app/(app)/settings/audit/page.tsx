import { redirect } from "next/navigation";
import { T } from "@/i18n/T";
import { getSession, redirectNoSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import AuditClient, { type AuditRow } from "./AuditClient";
import { getTenantPlan } from "@/lib/quota";
import { daysAgoIso } from "@/lib/quota-msg";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await getSession();
  if (!session) return redirectNoSession();
  if (!session.canManageWs)
    return <div style={{ color: "var(--ink-2)" }}><T k="page.wsAdminOnly" /></div>;

  const supabase = await createClient();
  // แสดงย้อนหลังตามแพ็กเกจ (auditDays) — ข้อมูลเก่ากว่านั้นยังเก็บอยู่ อัปเกรดแล้วเห็นได้
  const plan = await getTenantPlan(session.tenantId);
  const since = daysAgoIso(plan.auditDays);
  const [{ data: logs }, { data: members }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, actor_id, action, target_type, target_id, meta, created_at")
      .eq("tenant_id", session.tenantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("memberships").select("user_id, name, email").eq("tenant_id", session.tenantId),
  ]);

  const nameMap = new Map<string, string>();
  for (const m of (members || []) as { user_id: string; name: string | null; email: string | null }[]) {
    nameMap.set(m.user_id, m.name || m.email || m.user_id.slice(0, 8));
  }

  type Log = Omit<AuditRow, "actorName" | "targetName" | "formName">;
  const list = (logs || []) as Log[];

  // ชื่อเป้าหมายจริง (ฟอร์ม/เครื่อง/ชุดข้อมูล/เอกสาร) — เพื่อแสดง "ลบฟอร์ม: ตรวจรถ" แทนรหัส
  const idsOf = (type: string) => Array.from(new Set(list.filter((l) => l.target_type === type && l.target_id).map((l) => l.target_id as string)));
  const formIds = Array.from(new Set([...idsOf("form"), ...list.map((l) => l.meta?.form_id).filter((x): x is string => typeof x === "string")]));
  const devIds = idsOf("device");
  const dsIds = idsOf("dataset");
  const subIds = idsOf("submission");
  const none = Promise.resolve({ data: [] as Record<string, unknown>[] });
  const [fr, dr, dsr, sr, rr] = await Promise.all([
    formIds.length ? supabase.from("forms").select("id, title").eq("tenant_id", session.tenantId).in("id", formIds) : none,
    devIds.length ? supabase.from("devices").select("id, name").eq("tenant_id", session.tenantId).in("id", devIds) : none,
    dsIds.length ? supabase.from("datasets").select("id, name").eq("tenant_id", session.tenantId).in("id", dsIds) : none,
    subIds.length ? supabase.from("submissions").select("id, form_title").eq("tenant_id", session.tenantId).in("id", subIds) : none,
    supabase.from("tenant_roles").select("key, name").eq("tenant_id", session.tenantId),
  ]);
  const toMap = (rows: Record<string, unknown>[] | null, col: string) =>
    new Map((rows || []).map((x) => [String(x.id), String(x[col] || "")]));
  const forms = toMap(fr.data as Record<string, unknown>[] | null, "title");
  const byType: Record<string, Map<string, string>> = {
    form: forms,
    device: toMap(dr.data as Record<string, unknown>[] | null, "name"),
    dataset: toMap(dsr.data as Record<string, unknown>[] | null, "name"),
    submission: toMap(sr.data as Record<string, unknown>[] | null, "form_title"),
    user: nameMap,
  };
  const roleNames: Record<string, string> = {};
  for (const x of (rr.data || []) as { key: string; name: string | null }[]) if (x.name) roleNames[x.key] = x.name;

  const rows: AuditRow[] = list.map((l) => ({
    ...l,
    actorName: l.actor_id ? nameMap.get(l.actor_id) || l.actor_id.slice(0, 8) : "ระบบ",
    targetName: (l.target_type && l.target_id && byType[l.target_type]?.get(l.target_id)) || undefined,
    formName: typeof l.meta?.form_id === "string" ? forms.get(l.meta.form_id) : undefined,
  }));

  return <AuditClient rows={rows} roleNames={roleNames} days={plan.auditDays} />;
}
