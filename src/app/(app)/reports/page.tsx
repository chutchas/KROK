import { enforceMenu } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import ReportsClient, { type ReportFormOpt } from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await enforceMenu("reports");
  const supabase = await createClient();

  const { data } = await supabase
    .from("forms")
    .select("id, title, icon")
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .order("title");

  const forms: ReportFormOpt[] = ((data || []) as Record<string, unknown>[]).map((f) => ({
    id: f.id as string,
    title: (f.title as string) || "ฟอร์ม",
    icon: (f.icon as string) || "📋",
  }));

  return <ReportsClient forms={forms} />;
}
