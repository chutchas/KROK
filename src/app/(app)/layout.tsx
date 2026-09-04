import { redirect } from "next/navigation";
import { getSession, canManage } from "@/lib/session";
import AppShell from "@/components/AppShell";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell
      displayName={session.displayName}
      tenantName={session.tenantName}
      canManage={canManage(session.role)}
      userId={session.userId}
    >
      {children}
    </AppShell>
  );
}
