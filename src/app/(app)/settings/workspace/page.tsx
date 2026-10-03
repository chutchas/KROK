import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBranding } from "@/lib/branding";
import { getBrandLibrary, type BrandAsset } from "@/lib/branding-library";
import { getAdminClient } from "@/lib/supabase/admin";
import WorkspaceClient from "./WorkspaceClient";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "admin")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin เท่านั้น</div>;

  const supabase = await createClient();
  const [{ count: memberCount }, { count: formCount }, branding, library] = await Promise.all([
    supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("tenant_id", session.tenantId),
    supabase.from("forms").select("id", { count: "exact", head: true }).eq("tenant_id", session.tenantId),
    getWorkspaceBranding(supabase, session.tenantId),
    // คลังรูป (ยังไม่รัน 0056 = แจ้งในการ์ด ไม่ทำให้หน้าพัง)
    getBrandLibrary(supabase, getAdminClient() ?? supabase, session.tenantId)
      .then((assets): { assets: BrandAsset[]; error: string | null } => ({ assets, error: null }))
      .catch((e: unknown) => ({ assets: [] as BrandAsset[], error: e instanceof Error ? e.message : String(e) })),
  ]);

  return (
    <WorkspaceClient
      tenantName={session.tenantName}
      isOwner={session.role === "owner"}
      memberCount={memberCount ?? 0}
      formCount={formCount ?? 0}
      tenantId={session.tenantId}
      branding={branding}
      library={library}
    />
  );
}
