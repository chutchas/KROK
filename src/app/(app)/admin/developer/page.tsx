import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import DeveloperClient, { type PlatformStats } from "./DeveloperClient";

export const dynamic = "force-dynamic";

export default async function DeveloperPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isPlatformAdmin && session.platformRole !== "developer")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ Developer / Platform Admin เท่านั้น</div>;

  let stats: PlatformStats | null = null;
  const admin = getAdminClient();
  if (admin) {
    const [t, u, f, s, w] = await Promise.all([
      admin.from("tenants").select("id", { count: "exact", head: true }),
      admin.from("profiles").select("user_id", { count: "exact", head: true }),
      admin.from("forms").select("id", { count: "exact", head: true }).is("deleted_at", null),
      admin.from("submissions").select("id", { count: "exact", head: true }),
      admin.from("webhooks").select("id", { count: "exact", head: true }),
    ]);
    stats = {
      tenants: t.count ?? 0,
      users: u.count ?? 0,
      forms: f.count ?? 0,
      submissions: s.count ?? 0,
      webhooks: w.count ?? 0,
    };
  }

  return <DeveloperClient stats={stats} isPlatformAdmin={session.isPlatformAdmin} />;
}
