import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import WorkspaceClient from "./WorkspaceClient";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "admin")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin เท่านั้น</div>;

  const supabase = await createClient();
  const [{ count: memberCount }, { count: formCount }] = await Promise.all([
    supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("tenant_id", session.tenantId),
    supabase.from("forms").select("id", { count: "exact", head: true }).eq("tenant_id", session.tenantId),
  ]);

  return (
    <WorkspaceClient
      tenantName={session.tenantName}
      isOwner={session.role === "owner"}
      memberCount={memberCount ?? 0}
      formCount={formCount ?? 0}
    />
  );
}
