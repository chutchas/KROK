import { getSession, canManage, listWorkspaces, getAllowedMenus, redirectNoSession } from "@/lib/session";
import AppShell from "@/components/AppShell";
import InviteBanner from "@/components/InviteBanner";
import { myPendingInvites } from "@/lib/workspace-actions";
import TermsGate from "@/components/TermsGate";
import { LEGAL_VERSION } from "@/lib/legal";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // เปิด 2FA ไว้แต่ยังไม่ได้กรอกรหัส — ฐานข้อมูลบล็อกข้อมูลอยู่แล้ว (0055) พาไปกรอกรหัสก่อน
  // ไม่มี session: ค้าง 2FA → /login?mfa=1 · ล็อกอินแต่ไม่มี workspace → /welcome (เดิมวน /login ↔ /dashboard) · ไม่ได้ล็อกอิน → /login
  if (!session) return redirectNoSession();
  const [workspaces, allowedMenus, invites] = await Promise.all([
    listWorkspaces(),
    getAllowedMenus(session.tenantId, session.roleKey),
    myPendingInvites(),
  ]);

  return (
    <AppShell
      displayName={session.displayName}
      avatarUrl={session.avatarUrl}
      tenantName={session.tenantName}
      canManage={canManage(session.role)}
      role={session.role}
      isPlatformAdmin={session.isPlatformAdmin}
      platformRole={session.platformRole}
      allowedMenus={allowedMenus}
      userId={session.userId}
      workspaces={workspaces}
      activeTenantId={session.tenantId}
    >
      {session.termsVersion !== LEGAL_VERSION && <TermsGate version={LEGAL_VERSION} firstTime={!session.termsVersion} />}
      <InviteBanner invites={invites} />
      {children}
    </AppShell>
  );
}
