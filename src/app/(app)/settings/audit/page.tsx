import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import AuditClient, { type AuditRow } from "./AuditClient";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.canManageWs)
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับผู้ดูแล workspace เท่านั้น</div>;

  const supabase = await createClient();
  const [{ data: logs }, { data: members }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, actor_id, action, target_type, target_id, meta, created_at")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("memberships").select("user_id, name, email").eq("tenant_id", session.tenantId),
  ]);

  const nameMap = new Map<string, string>();
  for (const m of (members || []) as { user_id: string; name: string | null; email: string | null }[]) {
    nameMap.set(m.user_id, m.name || m.email || m.user_id.slice(0, 8));
  }

  const rows: AuditRow[] = ((logs || []) as Omit<AuditRow, "actorName">[]).map((l) => ({
    ...l,
    actorName: l.actor_id ? nameMap.get(l.actor_id) || l.actor_id.slice(0, 8) : "ระบบ",
  }));

  return <AuditClient rows={rows} tenantName={session.tenantName} />;
}
