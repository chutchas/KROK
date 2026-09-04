"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/NotificationBell";
import LanguageToggle from "@/components/LanguageToggle";
import ThemeToggle from "@/components/ThemeToggle";
import WorkspaceSwitcher, { type WorkspaceItem } from "@/components/WorkspaceSwitcher";
import Icon, { type IconType } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import { PenSquare, Smartphone, ClipboardCheck, BarChart3, Users, CreditCard, Webhook, Bot, HardHat, LogOut } from "lucide-react";

const NAV: { href: string; key: MessageKey; icon: IconType; manage: boolean }[] = [
  { href: "/studio", key: "nav.studio", icon: PenSquare, manage: true },
  { href: "/forms", key: "nav.fill", icon: Smartphone, manage: false },
  { href: "/approvals", key: "nav.approvals", icon: ClipboardCheck, manage: true },
  { href: "/dashboard", key: "nav.dashboard", icon: BarChart3, manage: false },
  { href: "/settings/team", key: "nav.team", icon: Users, manage: true },
  { href: "/settings/billing", key: "nav.billing", icon: CreditCard, manage: true },
  { href: "/settings/integrations", key: "nav.integrations", icon: Webhook, manage: true },
  { href: "/settings/ai", key: "nav.ai", icon: Bot, manage: true },
];

export default function AppShell({
  children,
  displayName,
  tenantName,
  canManage,
  userId,
  workspaces,
  activeTenantId,
}: {
  children: React.ReactNode;
  displayName: string;
  tenantName: string;
  canManage: boolean;
  userId: string;
  workspaces: WorkspaceItem[];
  activeTenantId: string;
}) {
  const path = usePathname();
  const router = useRouter();
  const { t } = useT();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const items = NAV.filter((n) => !n.manage || canManage);

  return (
    <>
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--line)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
        className="no-print"
      >
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          {workspaces.length > 1 || canManage ? (
            <WorkspaceSwitcher workspaces={workspaces} activeId={activeTenantId} />
          ) : (
            <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <LogoMark size={26} variant="compact" title="KROK" />
              <div>
                <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.15rem", letterSpacing: ".02em" }}>KROK</b>
                <small style={{ color: "var(--ink-3)", fontSize: ".7rem", display: "block", lineHeight: 1 }}>
                  {tenantName}
                </small>
              </div>
            </Link>
          )}

          <nav style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
            {items.map((n) => {
              const on = path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className="inline-flex items-center gap-1.5"
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontWeight: on ? 600 : 500,
                    fontSize: ".9rem",
                    textDecoration: "none",
                    color: on ? "var(--accent)" : "var(--ink-2)",
                    background: on ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <Icon icon={n.icon} className="h-[18px] w-[18px]" /> {t(n.key)}
                </Link>
              );
            })}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ThemeToggle />
            <LanguageToggle />
            <NotificationBell userId={userId} />
            <Link
              href="/settings/profile"
              title={t("nav.profile")}
              className="inline-flex items-center gap-1.5"
              style={{
                fontSize: ".8rem",
                color: "var(--ink-2)",
                border: "1px solid var(--line)",
                borderRadius: 20,
                padding: "5px 12px",
                textDecoration: "none",
              }}
            >
              <Icon icon={HardHat} className="h-4 w-4" /> {displayName}
            </Link>
            <button
              onClick={signOut}
              title={t("nav.signout")}
              className="inline-flex items-center gap-1.5"
              style={{
                fontSize: ".8rem",
                color: "var(--ink-3)",
                border: "1px solid var(--line)",
                borderRadius: 20,
                padding: "5px 12px",
                background: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Icon icon={LogOut} className="h-4 w-4" /> {t("nav.signout")}
            </button>
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 16px 90px" }}>{children}</main>
    </>
  );
}
