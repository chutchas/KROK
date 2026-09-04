import { redirect } from "next/navigation";
import { getSession, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import IntegrationsClient, { type WebhookItem } from "./IntegrationsClient";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManage(session.role))
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin/designer เท่านั้น</div>;

  const supabase = await createClient();
  const { data } = await supabase
    .from("webhooks")
    .select("id, name, url, events, secret, active, last_status, last_at")
    .eq("tenant_id", session.tenantId)
    .order("created_at", { ascending: true });

  const webhooks: WebhookItem[] = ((data || []) as Record<string, unknown>[]).map((w) => ({
    id: w.id as string,
    name: w.name as string,
    url: w.url as string,
    events: (w.events as string[]) ?? [],
    hasSecret: !!w.secret,
    active: (w.active as boolean) ?? true,
    lastStatus: (w.last_status as string) ?? null,
    lastAt: (w.last_at as string) ?? null,
  }));

  return <IntegrationsClient webhooks={webhooks} />;
}
