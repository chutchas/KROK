import { redirect } from "next/navigation";
import { getSession, getSignedInUser } from "@/lib/session";
import { myPendingInvites } from "@/lib/workspace-actions";
import WelcomeClient from "./WelcomeClient";

export const dynamic = "force-dynamic";

/**
 * ผู้ใช้ที่ล็อกอินแล้วแต่ไม่มี workspace ที่ใช้งานได้ — ถูกเอาออกจากทีม / workspace ถูกลบ / โหลด session ไม่สำเร็จ
 * (เดิม: layout ส่งไป /login แล้ว middleware ส่งกลับ /dashboard = วนไม่จบ ไม่มีปุ่มออกจากระบบ)
 * มี workspace แล้ว → เข้าแอปตามปกติ
 */
export default async function WelcomePage() {
  const me = await getSignedInUser();
  if (!me) redirect("/login");
  if (me.mfaPending) redirect("/login?mfa=1");
  if (await getSession()) redirect("/dashboard");
  const invites = me.loadFailed ? [] : await myPendingInvites();
  return <WelcomeClient email={me.email} invites={invites} loadFailed={me.loadFailed} hadWorkspace={me.hasWorkspace} />;
}
