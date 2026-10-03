import { redirect } from "next/navigation";
import { getSession, canManage, listWorkspaces, getAllowedMenus } from "@/lib/session";
import AppShell from "@/components/AppShell";
import InviteBanner from "@/components/InviteBanner";
import { myPendingInvites } from "@/lib/workspace-actions";
import TermsGate from "@/components/TermsGate";
import { LEGAL_VERSION } from "@/lib/legal";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
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
      {invites.length > 0 && <InviteBanner invites={invites} />}
      {children}
    </AppShell>
  );
}
