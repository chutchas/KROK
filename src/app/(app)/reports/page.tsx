import { canManage, enforceMenu } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import ReportsClient, { type ReportFormOpt } from "./ReportsClient";

export const metadata = { title: "รายงาน" };

export const dynamic = "force-dynamic";

const RESULT_LINKS = ["fail", "fail_open", "fail_closed"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const session = await enforceMenu("reports");
  const sp = await searchParams;
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

  // สมาชิกทั่วไป: รายงาน = ประวัติการส่งของตัวเอง (RLS) · เจ้าของ/แอดมิน: มีถังขยะเอกสารที่ลบ
  return <ReportsClient forms={forms} mine={!canManage(session.role)} canTrash={session.role === "owner" || session.role === "admin"}
    initialResult={sp.result && RESULT_LINKS.includes(sp.result) ? sp.result : null} />;
}
