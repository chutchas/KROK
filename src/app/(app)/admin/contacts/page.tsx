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
  let q = admin.from("contact_requests").select("id, created_at, name, company, email, phone, seats, message, emailed, email_error, handled_at").order("created_at", { ascending: false }).limit(300);
  if (all !== "1") q = q.is("handled_at", null);
  const { data, error } = await q;
  return <ContactsClient rows={(data || []) as ContactRow[]} missing={!!error} showAll={all === "1"} />;
}
