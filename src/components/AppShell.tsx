"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/NotificationBell";
import LanguageToggle from "@/components/LanguageToggle";
import ThemeToggle from "@/components/ThemeToggle";
import WorkspaceSwitcher, { type WorkspaceItem } from "@/components/WorkspaceSwitcher";
import OfflineSync from "@/components/OfflineSync";
import Icon, { type IconType } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import type { MenuKey, Role } from "@/lib/menus";
import { PenSquare, Smartphone, ClipboardCheck, BarChart3, Users, CreditCard, Webhook, Settings, HardHat, LogOut, Menu, ShieldCheck, UsersRound, ChevronDown, ReceiptText, X, Building2, ScrollText, Terminal } from "lucide-react";

type NavEntry = { href: string; key: MessageKey; icon: IconType; menu?: MenuKey; gate?: "wsadmin" | "platform" | "dev" };

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
  { href: "/settings/roles", key: "nav.roles", icon: ShieldCheck, gate: "wsadmin" },
  { href: "/settings/workspace", key: "nav.workspace", icon: Building2, gate: "wsadmin" },
  { href: "/settings/audit", key: "nav.audit", icon: ScrollText, gate: "wsadmin" },
  { href: "/admin/users", key: "nav.adminUsers", icon: UsersRound, gate: "platform" },
  { href: "/admin/settings", key: "nav.adminSystem", icon: Settings, gate: "dev" },
  { href: "/admin/audit", key: "nav.adminAudit", icon: ScrollText, gate: "platform" },
];

// หมวดหมู่ในเมนู sidebar (drawer)
const DRAWER_GROUPS: { labelKey: MessageKey; items: NavEntry[] }[] = [
  {
    labelKey: "grp.work",
    items: [
      { href: "/dashboard", key: "nav.dashboard", icon: BarChart3, menu: "dashboard" },
      { href: "/studio", key: "nav.studio", icon: PenSquare, menu: "studio" },
      { href: "/forms", key: "nav.fill", icon: Smartphone, menu: "forms" },
      { href: "/approvals", key: "nav.approvals", icon: ClipboardCheck, menu: "approvals" },
    ],
  },
  {
    labelKey: "grp.org",
    items: [
      { href: "/settings/team", key: "nav.team", icon: Users, menu: "team" },
      { href: "/settings/roles", key: "nav.roles", icon: ShieldCheck, gate: "wsadmin" },
      { href: "/settings/workspace", key: "nav.workspace", icon: Building2, gate: "wsadmin" },
      { href: "/settings/audit", key: "nav.audit", icon: ScrollText, gate: "wsadmin" },
    ],
  },
  {
    labelKey: "grp.connect",
    items: [
      { href: "/settings/integrations", key: "nav.integrations", icon: Webhook, menu: "integrations" },
    ],
  },
  {
    labelKey: "grp.billing",
    items: [
      { href: "/settings/billing", key: "nav.billing", icon: CreditCard, menu: "billing" },
      { href: "/settings/billing/history", key: "nav.billingHistory", icon: ReceiptText, gate: "wsadmin" },
    ],
  },
  {
    labelKey: "grp.platform",
    items: [
      { href: "/admin/users", key: "nav.adminUsers", icon: UsersRound, gate: "platform" },
      { href: "/admin/settings", key: "nav.adminSystem", icon: Settings, gate: "dev" },
      { href: "/admin/audit", key: "nav.adminAudit", icon: ScrollText, gate: "platform" },
      { href: "/admin/developer", key: "nav.developer", icon: Terminal, gate: "dev" },
    ],
  },
];

export default function AppShell({
  children,
  displayName,
  avatarUrl,
  tenantName,
  canManage,
  role,
  isPlatformAdmin,
  platformRole,
  allowedMenus,
  userId,
  workspaces,
  activeTenantId,
}: {
  children: React.ReactNode;
  displayName: string;
  avatarUrl: string;
  tenantName: string;
  canManage: boolean;
  role: Role;
  isPlatformAdmin: boolean;
  platformRole: "platform_admin" | "developer" | "user";
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
    if (n.gate === "dev") return isPlatformAdmin || platformRole === "developer";
    if (n.gate === "wsadmin") return isWsAdmin;
    if (n.menu) return allowed.has(n.menu);
    return true;
  };
  const primary = PRIMARY.filter(visible);
  const secondary = SECONDARY.filter(visible);
  // เลือก "แท็บที่ active" แบบเจาะจงที่สุด (href ที่ยาวสุดที่ตรงกับ path)
  // กันปัญหา /settings/billing กับ /settings/billing/history ติด active พร้อมกัน
  const allHrefs = Array.from(new Set([
    ...PRIMARY.map((n) => n.href),
    ...SECONDARY.map((n) => n.href),
    ...DRAWER_GROUPS.flatMap((g) => g.items.map((n) => n.href)),
  ]));
  const matchesHref = (href: string) => path === href || path.startsWith(href + "/");
  const activeHref = allHrefs.filter(matchesHref).sort((a, b) => b.length - a.length)[0] || "";
  const isActive = (href: string) => href === activeHref;
  const activeSecondary = secondary.find((n) => isActive(n.href));
  const navItems = activeSecondary ? [...primary, activeSecondary] : primary;

  return (
    <>
      <style>{`
        @media (max-width: 640px){
          /* มือถือ: ปุ่มควบคุม (theme/lang/noti/profile) ขึ้นแถวบนชิดขวา */
          .krok-controls{ order: 1; }
          /* เมนูหลักลงแถวที่สอง เต็มความกว้าง — บรรทัดเดียว เลื่อนแนวนอนถ้าไม่พอ (ไม่ตกบรรทัด) */
          .krok-nav{ order: 2; flex-basis: 100%; margin-left: -4px; overflow-x: auto; scrollbar-width: none; }
          .krok-nav::-webkit-scrollbar{ display: none; }
          .krok-nav a{ padding: 6px 9px !important; font-size: .82rem !important; flex: 0 0 auto; white-space: nowrap; }
          .krok-nav a > svg{ width: 16px !important; height: 16px !important; }
          /* ให้ปุ่มควบคุมอยู่แถวเดียวกับโลโก้เสมอ (ไม่ตกบรรทัด) */
          .krok-controls{ flex: 0 0 auto; gap: 6px !important; }
          .krok-brand{ flex: 1 1 auto; min-width: 0; }
          .krok-profile-name{ display: none !important; }
          .krok-ws-name{ max-width: 84px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        }
      `}</style>
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
          className="krok-topbar"
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
          <button
            onClick={() => setMenuOpen(true)}
            aria-label={t("nav.menu")}
            title={t("nav.menu")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ border: "none", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", flex: "0 0 auto" }}
          >
            <Icon icon={Menu} className="h-5 w-5" />
          </button>

          <div className="krok-brand" style={{ display: "flex", minWidth: 0 }}>
            {workspaces.length > 1 || canManage ? (
              <WorkspaceSwitcher workspaces={workspaces} activeId={activeTenantId} />
            ) : (
              <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", minWidth: 0 }}>
                <LogoMark size={26} variant="compact" title="KROK" />
                <div style={{ minWidth: 0 }}>
                  <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.15rem", letterSpacing: ".02em" }}>KROK</b>
                  <small className="krok-ws-name" style={{ color: "var(--ink-3)", fontSize: ".7rem", display: "block", lineHeight: 1 }}>
                    {tenantName}
                  </small>
                </div>
              </Link>
            )}
          </div>

          <nav className="krok-nav" style={{ display: "flex", gap: 2 }}>
            {navItems.map((n) => {
              const on = isActive(n.href);
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

          <div className="krok-controls" style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <OfflineSync />
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
                <Avatar url={avatarUrl} size={22} /><span className="krok-profile-name">{displayName}</span>
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
                  <div style={{ padding: "6px 10px 8px", borderBottom: "1px solid var(--line)", marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar url={avatarUrl} size={34} />
                    <div>
                      <b style={{ fontSize: ".88rem", display: "block" }}>{displayName}</b>
                      <small style={{ color: "var(--ink-3)", fontSize: ".72rem" }}>{tenantName}</small>
                    </div>
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

      {/* Sidebar drawer (เมนูเต็ม แบ่งหมวดหมู่) */}
      {menuOpen && (
        <div
          className="no-print"
          onClick={() => setMenuOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(10,14,18,.4)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
        >
          <aside
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: 300,
              maxWidth: "86vw",
              background: "var(--surface)",
              borderRight: "1px solid var(--line)",
              boxShadow: "0 0 40px rgba(10,14,18,.2)",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--surface)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <LogoMark size={28} variant="compact" title="KROK" />
                <div>
                  <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.1rem", letterSpacing: ".02em" }}>KROK</b>
                  <small style={{ color: "var(--ink-3)", fontSize: ".7rem", display: "block", lineHeight: 1 }}>{tenantName}</small>
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)} aria-label={t("common.close")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer" }}>
                <Icon icon={X} className="h-5 w-5" />
              </button>
            </div>

            <nav style={{ padding: "8px 8px 24px" }}>
              {DRAWER_GROUPS.map((g) => {
                const items = g.items.filter(visible);
                if (items.length === 0) return null;
                return (
                  <div key={g.labelKey} style={{ marginTop: 12 }}>
                    <div style={{ fontSize: ".68rem", color: "var(--ink-3)", fontWeight: 700, letterSpacing: ".06em", padding: "4px 12px 6px", textTransform: "uppercase" }}>
                      {t(g.labelKey)}
                    </div>
                    {items.map((n) => {
                      const on = isActive(n.href);
                      return (
                        <Link
                          key={n.href}
                          href={n.href}
                          onClick={() => setMenuOpen(false)}
                          className="inline-flex items-center gap-3"
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 9,
                            fontSize: ".95rem",
                            textDecoration: "none",
                            fontWeight: on ? 600 : 500,
                            color: on ? "var(--accent)" : "var(--ink)",
                            background: on ? "var(--accent-soft)" : "transparent",
                          }}
                        >
                          <Icon icon={n.icon} className="h-[19px] w-[19px]" /> {t(n.key)}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 16px 90px" }}>{children}</main>
    </>
  );
}

function Avatar({ url, size }: { url: string; size: number }) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }} />;
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
      <Icon icon={HardHat} className="h-3.5 w-3.5" />
    </span>
  );
}
