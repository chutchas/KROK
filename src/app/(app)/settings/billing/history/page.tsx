import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import HistoryClient, { type PlanEvent } from "./HistoryClient";

export const dynamic = "force-dynamic";

export default async function BillingHistoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "admin")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin เท่านั้น</div>;

  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("id, action, meta, created_at, actor_id")
    .eq("tenant_id", session.tenantId)
    .eq("action", "plan.change")
    .order("created_at", { ascending: false })
    .limit(100);

  const events: PlanEvent[] = ((data || []) as { id: string; meta: { plan?: string } | null; created_at: string }[]).map((r) => ({
    id: r.id,
    plan: (r.meta?.plan as string) || "—",
    at: r.created_at,
  }));

  return <HistoryClient events={events} />;
}
