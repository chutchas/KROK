import { redirect } from "next/navigation";
import { getAuthUser, getSession } from "@/lib/session";
import { myPendingInvites } from "@/lib/workspace-actions";
import WelcomeClient from "./WelcomeClient";

export const dynamic = "force-dynamic";

/**
 * ล็อกอินอยู่แต่ไม่มี workspace ที่ใช้ได้ (ถูกเอาออกจากทีม / workspace ถูกลบ / ฐานข้อมูลสะดุดตอนโหลด)
 * อยู่นอกกลุ่ม (app) — ไม่ต้องมี workspace ก็เปิดได้ · มี workspace แล้ว = เข้าแอปตามปกติ
 */
export default async function WelcomePage() {
  if (await getSession()) redirect("/dashboard");
  const u = await getAuthUser();
  if (!u) redirect("/login");
  if (u.mfaPending) redirect("/login?mfa=1");
  const invites = await myPendingInvites();
  return <WelcomeClient email={u.email} invites={invites} />;
}
