import { enforceMenu } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import TeamClient, { type Member, type Invite, type Team } from "./TeamClient";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await enforceMenu("team");
  if (session.role !== "owner" && session.role !== "admin")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin เท่านั้น</div>;

  const supabase = await createClient();
  const [{ data: members }, { data: invites }, { data: teams }, { data: teamMembers }, { data: roleDefs }] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, role, role_key, email, name, created_at")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("invites")
      .select("id, email, role, role_key, created_at")
      .eq("tenant_id", session.tenantId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("teams")
      .select("id, name, created_at")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("team_members")
      .select("team_id, user_id")
      .eq("tenant_id", session.tenantId),
    supabase
      .from("tenant_roles")
      .select("key, name, can_manage, sort")
      .eq("tenant_id", session.tenantId)
      .order("sort", { ascending: true }),
  ]);

  const tm = (teamMembers || []) as { team_id: string; user_id: string }[];
  const teamRows: Team[] = ((teams || []) as { id: string; name: string }[]).map((t) => ({
    id: t.id,
    name: t.name,
    memberIds: tm.filter((r) => r.team_id === t.id).map((r) => r.user_id),
  }));
  const roleOptions = ((roleDefs || []) as { key: string; name: string; can_manage: boolean }[]).map((r) => ({
    key: r.key,
    name: r.name,
    canManage: r.can_manage,
  }));

  return (
    <TeamClient
      me={session.userId}
      myRole={session.role}
      tenantName={session.tenantName}
      members={(members || []) as Member[]}
      invites={(invites || []) as Invite[]}
      teams={teamRows}
      roleOptions={roleOptions}
    />
  );
}
