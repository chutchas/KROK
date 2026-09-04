"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
import type { MenuKey, Role } from "@/lib/menus";
import { PenSquare, Smartphone, ClipboardCheck, BarChart3, Users, CreditCard, Webhook, Bot, HardHat, LogOut, Menu, ShieldCheck, UsersRound, ChevronDown } from "lucide-react";

type NavEntry = { href: string; key: MessageKey; icon: IconType; menu?: MenuKey; gate?: "wsadmin" | "platform" };

// เมนูหลัก — เห็นบน navbar ตลอด (งานที่ใช้ประจำ) กรองตามสิทธิ์เมนูของ role
const PRIMARY: NavEntry[] = [
  { href: "/dashboard", key: "nav.dashboard", icon: BarChart3, menu: "dashboard" },
  { href: "/studio", key: "nav.studio", icon: PenSquare, menu: "studio" },
  { href: "/forms", key: "nav.fill", icon: Smartphone, menu: "forms" },
];

// เมนูรอง — อยู่ในเมนู hamburger; ตัวที่กำลังเปิดจะโผล่มาเป็นแท็บ active บน navbar
const SECONDARY: NavEntry[] = [
  { href: "/approvals", key: "nav.approvals", icon: ClipboardCheck, menu: "approvals" },
  { href: "/settings/team", key: "nav.team", icon: Users, menu: "team" },
  { href: "/settings/billing", key: "nav.billing", icon: CreditCard, menu: "billing" },
  { href: "/settings/integrations", key: "nav.integrations", icon: Webhook, menu: "integrations" },
  { href: "/settings/ai", key: "nav.ai", icon: Bot, menu: "ai" },
  { href: "/settings/roles", key: "nav.roles", icon: ShieldCheck, gate: "wsadmin" },
  { href: "/admin/users", key: "nav.adminUsers", icon: UsersRound, gate: "platform" },
];

export default function AppShell({
  children,
  displayName,
  tenantName,
  canManage,
  role,
  isPlatformAdmin,
  allowedMenus,
  userId,
  workspaces,
  activeTenantId,
}: {
  children: React.ReactNode;
  displayName: string;
  tenantName: string;
  canManage: boolean;
  role: Role;
  isPlatformAdmin: boolean;
  allowedMenus: MenuKey[];
  userId: string;
  workspaces: WorkspaceItem[];
  activeTenantId: string;
}) {
  const path = usePathname();
  const router = useRouter();
  const { t } = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  // ปิดเมนูเมื่อเปลี่ยนหน้า
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
    setProfileOpen(false);
  }, [path]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const allowed = new Set(allowedMenus);
  const isWsAdmin = role === "owner" || role === "admin";
  const visible = (n: NavEntry) => {
    if (n.gate === "platform") return isPlatformAdmin;
    if (n.gate === "wsadmin") return isWsAdmin;
    if (n.menu) return allowed.has(n.menu);
    return true;
  };
  const primary = PRIMARY.filter(visible);
  const secondary = SECONDARY.filter(visible);
  const activeSecondary = secondary.find((n) => path.startsWith(n.href));
  const navItems = activeSecondary ? [...primary, activeSecondary] : primary;

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
          {secondary.length > 0 && (
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={t("nav.more")}
                title={t("nav.more")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ border: "none", background: menuOpen ? "var(--accent-soft)" : "transparent", color: menuOpen ? "var(--accent)" : "var(--ink-2)", cursor: "pointer", fontFamily: "inherit" }}
              >
                <Icon icon={Menu} className="h-5 w-5" />
              </button>
              {menuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    minWidth: 220,
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    boxShadow: "var(--shadow)",
                    padding: 6,
                    zIndex: 40,
                  }}
                >
                  <div style={{ fontSize: ".7rem", color: "var(--ink-3)", padding: "6px 10px 4px", fontWeight: 600, letterSpacing: ".03em" }}>
                    {t("nav.more")}
                  </div>
                  {secondary.map((n) => {
                    const on = path.startsWith(n.href);
                    return (
                      <Link
                        key={n.href}
                        href={n.href}
                        onClick={() => setMenuOpen(false)}
                        className="inline-flex items-center gap-2.5"
                        style={{
                          width: "100%",
                          padding: "9px 10px",
                          borderRadius: 8,
                          fontSize: ".9rem",
                          textDecoration: "none",
                          fontWeight: on ? 600 : 500,
                          color: on ? "var(--accent)" : "var(--ink)",
                          background: on ? "var(--accent-soft)" : "transparent",
                        }}
                      >
                        <Icon icon={n.icon} className="h-[18px] w-[18px]" /> {t(n.key)}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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

          <nav style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {navItems.map((n) => {
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

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <ThemeToggle />
            <LanguageToggle />
            <NotificationBell userId={userId} />
            <div ref={profileRef} style={{ position: "relative" }}>
              <button
                onClick={() => setProfileOpen((v) => !v)}
                title={t("nav.profile")}
                className="inline-flex items-center gap-1.5"
                style={{
                  fontSize: ".8rem",
                  color: "var(--ink-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 20,
                  padding: "5px 12px",
                  background: profileOpen ? "var(--accent-soft)" : "var(--surface)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Icon icon={HardHat} className="h-4 w-4" /> {displayName}
                <Icon icon={ChevronDown} className="h-3.5 w-3.5" />
              </button>
              {profileOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    minWidth: 200,
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    boxShadow: "var(--shadow)",
                    padding: 6,
                    zIndex: 40,
                  }}
                >
                  <div style={{ padding: "6px 10px 8px", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
                    <b style={{ fontSize: ".88rem", display: "block" }}>{displayName}</b>
                    <small style={{ color: "var(--ink-3)", fontSize: ".72rem" }}>{tenantName}</small>
                  </div>
                  <Link
                    href="/settings/profile"
                    onClick={() => setProfileOpen(false)}
                    className="inline-flex items-center gap-2.5"
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 8, fontSize: ".9rem", textDecoration: "none", color: "var(--ink)" }}
                  >
                    <Icon icon={HardHat} className="h-[18px] w-[18px]" /> {t("nav.profile")}
                  </Link>
                  <button
                    onClick={signOut}
                    className="inline-flex items-center gap-2.5"
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 8, fontSize: ".9rem", textAlign: "left", border: "none", background: "transparent", color: "var(--fail)", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    <Icon icon={LogOut} className="h-[18px] w-[18px]" /> {t("nav.signout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 16px 90px" }}>{children}</main>
    </>
  );
}
