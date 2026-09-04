import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import TeamClient, { type Member, type Invite, type Team } from "./TeamClient";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "admin")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin เท่านั้น</div>;

  const supabase = await createClient();
  const [{ data: members }, { data: invites }, { data: teams }, { data: teamMembers }] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, role, email, name, created_at")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("invites")
      .select("id, email, role, created_at")
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
  ]);

  const tm = (teamMembers || []) as { team_id: string; user_id: string }[];
  const teamRows: Team[] = ((teams || []) as { id: string; name: string }[]).map((t) => ({
    id: t.id,
    name: t.name,
    memberIds: tm.filter((r) => r.team_id === t.id).map((r) => r.user_id),
  }));

  return (
    <TeamClient
      me={session.userId}
      myRole={session.role}
      tenantName={session.tenantName}
      members={(members || []) as Member[]}
      invites={(invites || []) as Invite[]}
      teams={teamRows}
    />
  );
}
