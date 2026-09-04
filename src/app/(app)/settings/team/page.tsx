import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import TeamClient, { type Member, type Invite } from "./TeamClient";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "admin")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin เท่านั้น</div>;

  const supabase = await createClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
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
  ]);

  return (
    <TeamClient
      me={session.userId}
      myRole={session.role}
      tenantName={session.tenantName}
      members={(members || []) as Member[]}
      invites={(invites || []) as Invite[]}
    />
  );
}
