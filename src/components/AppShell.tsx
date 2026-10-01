"use client";
import { backdropClose } from "@/lib/backdrop";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PROFILE_AVATAR_EVENT, PROFILE_NAME_EVENT, firstName } from "@/lib/profile-events";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/NotificationBell";
import LanguageToggle from "@/components/LanguageToggle";
import ThemeToggle from "@/components/ThemeToggle";
import WorkspaceSwitcher, { WorkspaceChip, type WorkspaceItem } from "@/components/WorkspaceSwitcher";
import OfflineSync from "@/components/OfflineSync";
import Icon, { type IconType } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import type { MenuKey, Role } from "@/lib/menus";
import { PenSquare, Smartphone, ClipboardCheck, BarChart3, Users, CreditCard, Webhook, Settings, HardHat, LogOut, Menu, ShieldCheck, UsersRound, ChevronDown, ReceiptText, X, Building2, ScrollText, Terminal, FileSpreadsheet, TabletSmartphone, Database } from "lucide-react";

type NavEntry = { href: string; key: MessageKey; icon: IconType; menu?: MenuKey; gate?: "wsadmin" | "platform" | "dev" };

// เมนูกลุ่มงานหลัก — อยู่บน navbar ครบทุกตัว (ไม่อยู่ใน sidebar) กรองตามสิทธิ์เมนูของ role
const PRIMARY: NavEntry[] = [
  { href: "/dashboard", key: "nav.dashboard", icon: BarChart3, menu: "dashboard" },
  { href: "/studio", key: "nav.studio", icon: PenSquare, menu: "studio" },
  { href: "/forms", key: "nav.fill", icon: Smartphone, menu: "forms" },
  { href: "/datasets", key: "nav.datasets", icon: Database, menu: "datasets" },
  { href: "/approvals", key: "nav.approvals", icon: ClipboardCheck, menu: "approvals" },
  { href: "/reports", key: "nav.reports", icon: FileSpreadsheet, menu: "reports" },
];

// เมนูอื่น — อยู่ใน sidebar; ตัวที่กำลังเปิดจะโผล่ต่อท้ายเมนูหลักบน navbar เป็นแท็บ active
const SECONDARY: NavEntry[] = [
  { href: "/settings/team", key: "nav.team", icon: Users, menu: "team" },
  { href: "/settings/billing", key: "nav.billing", icon: CreditCard, menu: "billing" },
  { href: "/settings/integrations", key: "nav.integrations", icon: Webhook, menu: "integrations" },
  { href: "/settings/roles", key: "nav.roles", icon: ShieldCheck, gate: "wsadmin" },
  { href: "/settings/workspace", key: "nav.workspace", icon: Building2, gate: "wsadmin" },
  { href: "/settings/devices", key: "nav.devices", icon: TabletSmartphone, gate: "wsadmin" },
  { href: "/settings/audit", key: "nav.audit", icon: ScrollText, gate: "wsadmin" },
  { href: "/admin/users", key: "nav.adminUsers", icon: UsersRound, gate: "platform" },
  { href: "/admin/settings", key: "nav.adminSystem", icon: Settings, gate: "dev" },
  { href: "/admin/audit", key: "nav.adminAudit", icon: ScrollText, gate: "platform" },
];

// หมวดหมู่ในเมนู sidebar (drawer) — ไม่มีกลุ่มงานหลัก เพราะอยู่บน navbar แล้ว
const DRAWER_GROUPS: { labelKey: MessageKey; items: NavEntry[] }[] = [
  {
    labelKey: "grp.org",
    items: [
      { href: "/settings/team", key: "nav.team", icon: Users, menu: "team" },
      { href: "/settings/roles", key: "nav.roles", icon: ShieldCheck, gate: "wsadmin" },
      { href: "/settings/workspace", key: "nav.workspace", icon: Building2, gate: "wsadmin" },
      { href: "/settings/devices", key: "nav.devices", icon: TabletSmartphone, gate: "wsadmin" },
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
  // ชื่อที่เพิ่งบันทึกในหน้าโปรไฟล์ — แสดงทันที จนกว่า server จะส่งชื่อใหม่มา (base = ชื่อจาก server ตอนที่รับ event)
  const [liveName, setLiveName] = useState<{ name: string; base: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setLiveName({ name: (e as CustomEvent<string>).detail, base: displayName });
    window.addEventListener(PROFILE_NAME_EVENT, on);
    return () => window.removeEventListener(PROFILE_NAME_EVENT, on);
  }, [displayName]);
  const fullName = liveName && liveName.base === displayName ? liveName.name : displayName;
  const [liveAvatar, setLiveAvatar] = useState<{ url: string; base: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setLiveAvatar({ url: (e as CustomEvent<string>).detail, base: avatarUrl });
    window.addEventListener(PROFILE_AVATAR_EVENT, on);
    return () => window.removeEventListener(PROFILE_AVATAR_EVENT, on);
  }, [avatarUrl]);
  const shownAvatar = liveAvatar && liveAvatar.base === avatarUrl ? liveAvatar.url : avatarUrl;
  const shortName = firstName(fullName);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    // Esc ปิดเมนู/เมนูโปรไฟล์ (คีย์บอร์ด + โปรแกรมอ่านหน้าจอ)
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setMenuOpen(false); setProfileOpen(false); }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
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
  // หาเมนูที่เปิดอยู่จากทุกเมนูใน sidebar ด้วย (เช่น Developer, ประวัติ/ใบเสร็จ ที่ไม่ได้อยู่ใน SECONDARY)
  const activeSecondary = [...secondary, ...DRAWER_GROUPS.flatMap((g) => g.items).filter(visible)].find((n) => isActive(n.href));
  const navItems = activeSecondary ? [...primary, activeSecondary] : primary;

  // มือถือ: แถบเมนูเลื่อนแนวนอนได้ → เลื่อนให้แท็บที่ active มาอยู่ในจอเสมอ (ไม่ต้องปัดหาเอง)
  // เลื่อนเฉพาะแถบเมนู (scrollTo) ไม่ใช้ scrollIntoView ซึ่งจะเลื่อนทั้งหน้าด้วย
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!nav || !el || nav.scrollWidth <= nav.clientWidth) return;
    const target = el.offsetLeft - nav.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [activeHref]);
  // ขอบจาง ซ้าย/ขวา บอกว่ายังมีเมนูให้ปัดดู
  const [edge, setEdge] = useState({ l: false, r: false });
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const upd = () => {
      const l = nav.scrollLeft > 2;
      const r = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2;
      setEdge((e) => (e.l === l && e.r === r ? e : { l, r }));
    };
    upd();
    nav.addEventListener("scroll", upd, { passive: true });
    const ro = new ResizeObserver(upd);
    ro.observe(nav);
    return () => { nav.removeEventListener("scroll", upd); ro.disconnect(); };
  }, [navItems.length]);
  const fade = edge.l || edge.r
    ? `linear-gradient(to right, ${edge.l ? "transparent 0, #000 28px" : "#000 0"}, ${edge.r ? "#000 calc(100% - 28px), transparent 100%" : "#000 100%"})`
    : undefined;
  // จอคอม: หมุนล้อเมาส์บนแถบเมนู = ปัดซ้าย-ขวา (เมาส์ส่วนใหญ่ไม่มีล้อแนวนอน)
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const onWheel = (e: WheelEvent) => {
      if (nav.scrollWidth <= nav.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      nav.scrollLeft += e.deltaY;
    };
    nav.addEventListener("wheel", onWheel, { passive: false });
    return () => nav.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <>
      <style>{`
        /* แถบเมนูหลัก: ที่ไม่พอ → ปัดซ้าย-ขวาได้ (ทุกขนาดจอ) ไม่ตกบรรทัด ไม่ซ่อนชื่อ */
        .krok-nav{ overflow-x: auto; scrollbar-width: none; overscroll-behavior-x: contain; }
        .krok-nav::-webkit-scrollbar{ display: none; }
        /* จอคอม: แถวเดียวเสมอ — เมนูหลักยอมหดแล้วปัด ส่วน workspace + ปุ่มขวาคงขนาด */
        @media (min-width: 641px){
          .krok-topbar{ flex-wrap: nowrap !important; }
          .krok-ws-slot, .krok-controls{ flex-shrink: 0; }
        }
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
          /* มือถือ: ปุ่ม workspace แถวที่ 2 เต็มความกว้าง (ชื่อเต็ม ▾ ชิดขวา) · เมนูหลักแถวที่ 3 */
          .krok-ws-slot{ order: 2; flex-basis: 100%; margin-left: 0 !important; }
          .krok-ws-slot > div, .krok-ws-slot .krok-ws-chip{ width: 100%; }
          .krok-ws-slot .krok-ws-name{ flex: 1 1 auto; max-width: none !important; }
          .krok-nav{ order: 3; }
          .krok-ws-menu{ left: 0; }
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
            // ความกว้างเดียวกับเนื้อหา (--krok-page-w) → ขอบซ้าย-ขวาของแถบบนตรงกับเนื้อหาทุกหน้า
            maxWidth: "var(--krok-page-w)",
            margin: "0 auto",
            padding: "10px var(--krok-gutter)",
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

          <div className="krok-brand" style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
            <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flex: "0 0 auto" }} aria-label="KROK">
              <LogoMark size={26} variant="compact" title="KROK" />
              <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.15rem", letterSpacing: ".02em" }}>KROK</b>
            </Link>
          </div>

          <nav ref={navRef} className="krok-nav" aria-label={t("nav.menu")} style={{ display: "flex", gap: 0, minWidth: 0, flex: "0 1 auto", maskImage: fade, WebkitMaskImage: fade }}>
            {navItems.map((n) => {
              const on = isActive(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  title={t(n.key)}
                  className="inline-flex items-center gap-1.5"
                  style={{
                    padding: "7px 9px",
                    borderRadius: 8,
                    fontWeight: on ? 600 : 500,
                    fontSize: ".84rem",
                    whiteSpace: "nowrap",
                    flex: "0 0 auto",
                    textDecoration: "none",
                    color: on ? "var(--accent)" : "var(--ink-2)",
                    background: on ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <Icon icon={n.icon} className="h-[17px] w-[17px]" /> <span className="krok-nav-label">{t(n.key)}</span>
                </Link>
              );
            })}
          </nav>

          {/* ปุ่ม workspace (ตัวย่อ + ชื่อตัวหนา ▾) — จอคอม: ฝั่งขวาก่อนปุ่มสลับโหมด · มือถือ: แถวที่ 2 เต็มความกว้าง */}
          <div className="krok-ws-slot" style={{ display: "flex", alignItems: "center", minWidth: 0, marginLeft: "auto" }}>
            {workspaces.length > 1 || canManage ? (
              <WorkspaceSwitcher workspaces={workspaces} activeId={activeTenantId} />
            ) : (
              <WorkspaceChip name={tenantName} />
            )}
          </div>

          <div className="krok-controls" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <OfflineSync />
            <ThemeToggle />
            <LanguageToggle />
            <NotificationBell userId={userId} />
            <div ref={profileRef} style={{ position: "relative" }}>
              <button
                onClick={() => setProfileOpen((v) => !v)}
                title={t("nav.profile")}
                aria-label={t("nav.profile")}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
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
                <Avatar url={shownAvatar} size={22} /><span className="krok-profile-name" title={fullName} style={{ maxWidth: "9em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName}</span>
                <Icon icon={ChevronDown} className="h-3.5 w-3.5" />
              </button>
              {profileOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    width: "max-content",
                    minWidth: 280,
                    maxWidth: "min(380px, calc(100vw - 24px))",
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    boxShadow: "var(--shadow)",
                    padding: 6,
                    zIndex: 40,
                  }}
                >
                  <div style={{ padding: "6px 10px 8px", borderBottom: "1px solid var(--line)", marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar url={shownAvatar} size={40} />
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: ".88rem", display: "block", overflowWrap: "break-word" }}>{fullName}</b>
                      <small style={{ color: "var(--ink-3)", fontSize: ".72rem", display: "block", overflowWrap: "break-word" }}>{tenantName}</small>
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
          {...backdropClose(() => setMenuOpen(false))}
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(10,14,18,.4)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
        >
          <aside
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label={tenantName}
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
              <button onClick={() => setMenuOpen(false)} aria-label={t("common.close")} className="inline-flex h-10 w-10 items-center justify-center rounded-lg" style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer" }}>
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

      <main style={{ maxWidth: "var(--krok-page-w)", margin: "0 auto", padding: "20px var(--krok-gutter) 90px" }}>{children}</main>
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
