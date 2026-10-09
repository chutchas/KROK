import { redirect } from "next/navigation";
import { getSession, redirectNoSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { runHealth } from "@/lib/platform-health";
import HealthClient from "./HealthClient";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// สุขภาพระบบ — เช็กอัตโนมัติทุกครั้งที่เปิดหน้า (ฟรี) · ทดสอบ AI จริงต้องกดปุ่มเอง (เสียค่า token เล็กน้อย)
export default async function HealthPage() {
  const session = await getSession();
  if (!session) return redirectNoSession();
  if (!session.isPlatformAdmin && session.platformRole !== "developer") return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ Developer / Platform Admin เท่านั้น</div>;
  const admin = getAdminClient();
  if (!admin) return <div style={{ color: "var(--fail)" }}>ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY ฝั่ง server — ระบบส่วนใหญ่จะใช้งานไม่ได้</div>;
  const report = await runHealth(admin);
  return <HealthClient report={report} />;
}
