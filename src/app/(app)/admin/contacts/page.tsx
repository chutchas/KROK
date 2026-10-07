import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import ContactsClient, { type ContactRow } from "./ContactsClient";

export const dynamic = "force-dynamic";

// ข้อความจากหน้า "ติดต่อเรา" (0068) — ดู/ติ๊กว่าติดต่อแล้ว/ลบ
export default async function AdminContactsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isPlatformAdmin) return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ Platform Admin เท่านั้น</div>;
  const admin = getAdminClient();
  if (!admin) return <div style={{ color: "var(--fail)" }}>ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY ฝั่ง server</div>;
  const { all } = await searchParams;
  const cols = "id, created_at, name, company, email, phone, seats, message, emailed, email_error, handled_at";
  const run = (sel: string) => {
    let q = admin.from("contact_requests").select(sel).order("created_at", { ascending: false }).limit(300);
    if (all !== "1") q = q.is("handled_at", null);
    return q;
  };
  let { data, error } = await run(`${cols}, topic, user_id, tenant_id`);
  const old0069 = !!error;
  if (error) ({ data, error } = await run(cols)); // ยังไม่รัน 0069
  const rows = ((data || []) as unknown as ContactRow[]).map((r) => ({ ...r, topic: r.topic ?? "", user_id: r.user_id ?? null, tenant_id: r.tenant_id ?? null, workspace: null as string | null }));
  // ชื่อ workspace ของผู้ส่งที่ล็อกอินอยู่
  const tids = [...new Set(rows.map((r) => r.tenant_id).filter((x): x is string => !!x))];
  if (tids.length) {
    const { data: ts } = await admin.from("tenants").select("id, name").in("id", tids);
    const names = new Map((ts || []).map((x) => [x.id as string, x.name as string]));
    for (const r of rows) if (r.tenant_id) r.workspace = names.get(r.tenant_id) ?? "—";
  }
  return <ContactsClient rows={rows} missing={!!error} need0069={!error && old0069} showAll={all === "1"} />;
}
