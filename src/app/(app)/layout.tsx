import { redirect } from "next/navigation";
import { getSession, canManage, listWorkspaces, getAllowedMenus } from "@/lib/session";
import AppShell from "@/components/AppShell";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const [workspaces, allowedMenus] = await Promise.all([
    listWorkspaces(),
    getAllowedMenus(session.tenantId, session.roleKey),
  ]);

  return (
    <AppShell
      displayName={session.displayName}
      tenantName={session.tenantName}
      canManage={canManage(session.role)}
      role={session.role}
      isPlatformAdmin={session.isPlatformAdmin}
      allowedMenus={allowedMenus}
      userId={session.userId}
      workspaces={workspaces}
      activeTenantId={session.tenantId}
    >
      {children}
    </AppShell>
  );
}
