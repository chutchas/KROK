import { redirect } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import Icon from "@/components/Icon";
import { Notice } from "@/components/ui";
import { T } from "@/i18n/T";
import { getSession, redirectNoSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import TrashClient, { type TrashRow } from "./TrashClient";

export const metadata = { title: "ถังขยะ" };

export const dynamic = "force-dynamic";

// ถังขยะเอกสาร — owner/admin · เอกสารที่ลบภายใน 30 วัน กู้คืนได้ (เลยกำหนด = cron cleanup ลบจริงพร้อมรูป)
export default async function TrashPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const session = await getSession();
  if (!session) return redirectNoSession();
  if (session.role !== "owner" && session.role !== "admin") redirect("/reports");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deleted_submissions", { p_tenant: session.tenantId });
  const rows: TrashRow[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    docNo: (r.doc_no as string) || String(r.id).slice(0, 8).toUpperCase(),
    form: (r.form_title as string) || "-",
    icon: (r.form_icon as string) || "📋",
    user: (r.user_name as string) || "-",
    submittedAt: (r.submitted_at as string) || "",
    deletedAt: (r.deleted_at as string) || "",
    deletedBy: (r.deleted_by_name as string) || "-",
    reason: (r.delete_reason as string) || "",
  }));
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <a href="/reports" style={{ fontSize: ".9rem", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon icon={ArrowLeft} className="h-4 w-4" /> <T k="report.title" /></a>
      <div>
        <h1 style={{ fontSize: "1.4rem", margin: "0 0 2px", display: "inline-flex", alignItems: "center", gap: 8 }}><Icon icon={Trash2} className="h-5 w-5" /> <T k="trash.title" /></h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}><T k="trash.sub" /></p>
      </div>
      {sp.deleted === "1" && <div role="status"><Notice kind="info"><T k="trash.deletedOk" /></Notice></div>}
      {/* ยังไม่ได้รัน migration 0079 */}
      {error ? <Notice kind="error"><T k="trash.needMigration" /></Notice> : <TrashClient rows={rows} />}
    </div>
  );
}
