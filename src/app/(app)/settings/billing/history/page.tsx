import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import HistoryClient, { type PlanEvent, type InvoiceRow } from "./HistoryClient";

export const dynamic = "force-dynamic";

export default async function BillingHistoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "admin")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin เท่านั้น</div>;

  const supabase = await createClient();
  const [{ data: log }, { data: inv }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, meta, created_at")
      .eq("tenant_id", session.tenantId)
      .eq("action", "plan.change")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("invoices")
      .select("id, number, plan, amount, currency, period, status, issued_at")
      .eq("tenant_id", session.tenantId)
      .order("issued_at", { ascending: false })
      .limit(100),
  ]);

  const events: PlanEvent[] = ((log || []) as { id: string; meta: { plan?: string } | null; created_at: string }[]).map((r) => ({
    id: r.id,
    plan: (r.meta?.plan as string) || "—",
    at: r.created_at,
  }));

  const invoices: InvoiceRow[] = ((inv || []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    number: (r.number as string) || "—",
    plan: r.plan as string,
    amount: (r.amount as number) ?? 0,
    currency: (r.currency as string) || "THB",
    period: r.period as string,
    status: r.status as InvoiceRow["status"],
    issuedAt: r.issued_at as string,
  }));

  return <HistoryClient events={events} invoices={invoices} />;
}
