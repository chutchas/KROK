"use client";
import { getAllPending } from "@/lib/offline-queue";
import { confirmDialog } from "@/components/dialogs";
import { backdropClose } from "@/lib/backdrop";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PROFILE_AVATAR_EVENT, PROFILE_NAME_EVENT, firstName } from "@/lib/profile-events";
import TourGuide, { TOUR_START_EVENT } from "@/components/TourGuide";
import { SETTINGS_HUBS, canSee, hubOf, type NavCtx, type SettingsHub } from "@/lib/settings-nav";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/NotificationBell";
import LanguageToggle from "@/components/LanguageToggle";
import ThemeToggle from "@/components/ThemeToggle";
import WorkspaceSwitcher, { WorkspaceChip, type WorkspaceItem } from "@/components/WorkspaceSwitcher";
import OfflineSync from "@/components/OfflineSync";
import OfflinePrep from "@/components/OfflinePrep";
import { clearBundles, clearLocalDrafts, listLocalDrafts } from "@/lib/offline-store";
import Icon, { type IconType } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import type { MenuKey, Role } from "@/lib/menus";
import { PenSquare, Smartphone, ClipboardCheck, BarChart3, Users, CreditCard, Webhook, Settings, HardHat, LogOut, Menu, UsersRound, ChevronDown, X, Building2, ScrollText, Terminal, FileSpreadsheet, Database, CircleHelp, Bug, HeartPulse, Wallet, Inbox, LifeBuoy } from "lucide-react";

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

// เมนูระบบ (ผู้ดูแลแพลตฟอร์ม) — อยู่ใน sidebar; ตัวที่กำลังเปิดจะโผล่ต่อท้ายเมนูหลักบน navbar เป็นแท็บ active
const PLATFORM: NavEntry[] = [
  // งาน Admin / Support
  { href: "/admin/users", key: "nav.adminUsers", icon: UsersRound, gate: "platform" },
  { href: "/admin/audit", key: "nav.adminAudit", icon: ScrollText, gate: "platform" },
  { href: "/admin/finance", key: "nav.adminFinance", icon: Wallet, gate: "platform" },
  { href: "/admin/contacts", key: "nav.adminContacts", icon: Inbox, gate: "platform" },
  { href: "/admin/settings", key: "nav.adminSystem", icon: Settings, gate: "platform" },
  // งาน Technical (Developer เห็นด้วย)
  { href: "/admin/health", key: "nav.adminHealth", icon: HeartPulse, gate: "dev" },
  { href: "/admin/errors", key: "nav.adminErrors", icon: Bug, gate: "dev" },
  { href: "/admin/developer", key: "nav.developer", icon: Terminal, gate: "dev" },
];

// ไอคอนของหมวดตั้งค่า (โครงหมวด/แท็บอยู่ที่ lib/settings-nav)
const HUB_ICON: Record<SettingsHub["key"], typeof Users> = {
  people: Users,
  workspace: Building2,
  connect: Webhook,
  billing: CreditCard,
};

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
  const { t, tt } = useT();
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
    // ยังมีใบที่รอส่ง (ออฟไลน์) → เตือนก่อน: รายการยังเก็บในเครื่อง และส่งเมื่อคนนี้ล็อกอินกลับมา
    const sb = createClient();
    try {
      const me = (await sb.auth.getSession()).data.session?.user.id;
      const n = me ? (await getAllPending()).filter((p) => p.userId === me).length : 0;
      if (n > 0 && !(await confirmDialog({ message: tt("sync.signOutPending", { n }), confirmLabel: t("sync.signOutAnyway") }))) return;
      // ร่างที่บันทึกในเครื่อง (ตอนออฟไลน์) จะถูกลบเมื่อออกจากระบบ — เครื่องที่ใช้ร่วมกันจะได้ไม่เห็นงานของคนก่อน
      const d = me ? (await listLocalDrafts(me)).length : 0;
      if (d > 0 && !(await confirmDialog({ message: tt("sync.signOutDrafts", { n: d }), confirmLabel: t("sync.signOutAnyway"), danger: true }))) return;
    } catch { /* อ่านคิวไม่ได้ → ออกจากระบบตามปกติ */ }
    await sb.auth.signOut();
    // ฟอร์มที่ดาวน์โหลดไว้ + ร่างในเครื่องไม่ค้างหลังออกจากระบบ (คิวที่ยังไม่ส่งยังเก็บไว้ — ส่งเมื่อคนเดิมล็อกอินกลับมา)
    await clearBundles(userId);
    await clearLocalDrafts(userId);
    router.push("/login");
    router.refresh();
  }

  const allowed = new Set(allowedMenus);
  const isWsAdmin = role === "owner" || role === "admin";
  const navCtx: NavCtx = { allowed, isWsAdmin, isPlatformAdmin, platformRole };
  const visible = (n: NavEntry) => canSee(n, navCtx);
  const primary = PRIMARY.filter(visible);
  // หมวดตั้งค่า: แสดงเมื่อเห็นอย่างน้อย 1 แท็บ · ลิงก์ไปแท็บแรกที่เห็น
  const hubs = SETTINGS_HUBS.map((h) => ({ hub: h, items: h.items.filter((it) => canSee(it, navCtx)) }))
    .filter((h) => h.items.length > 0)
    .map((h): NavEntry & { hubKey: SettingsHub["key"] } => ({ href: h.items[0].href, key: h.hub.labelKey, icon: HUB_ICON[h.hub.key], hubKey: h.hub.key }));
  const platform = PLATFORM.filter(visible);
  const matchesHref = (href: string) => path === href || path.startsWith(href + "/");
  const activeHubKey = hubOf(path)?.hub.key;
  const activePrimary = primary.filter((n) => matchesHref(n.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const activePlatform = platform.find((n) => matchesHref(n.href))?.href;
  const isActive = (href: string) => href === activePrimary || href === activePlatform || hubs.some((h) => h.href === href && h.hubKey === activeHubKey);
  const activeSecondary = hubs.find((h) => h.hubKey === activeHubKey) ?? platform.find((n) => n.href === activePlatform);
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
  }, [path]);
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
            data-tour="menu"
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

          <nav ref={navRef} data-tour="nav" className="krok-nav" aria-label={t("nav.menu")} style={{ display: "flex", gap: 0, minWidth: 0, flex: "0 1 auto", maskImage: fade, WebkitMaskImage: fade }}>
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
          <div className="krok-ws-slot" data-tour="ws" style={{ display: "flex", alignItems: "center", minWidth: 0, marginLeft: "auto" }}>
            {workspaces.length > 1 || canManage ? (
              <WorkspaceSwitcher workspaces={workspaces} activeId={activeTenantId} />
            ) : (
              <WorkspaceChip name={tenantName} />
            )}
          </div>

          <div className="krok-controls" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <OfflineSync />
            <OfflinePrep userId={userId} tenantId={activeTenantId} />
            <ThemeToggle />
            <LanguageToggle />
            <NotificationBell userId={userId} />
            <div ref={profileRef} data-tour="profile" style={{ position: "relative" }}>
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
                    onClick={() => { setProfileOpen(false); window.dispatchEvent(new Event(TOUR_START_EVENT)); }}
                    className="inline-flex items-center gap-2.5"
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 8, fontSize: ".9rem", textAlign: "left", border: "none", background: "transparent", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    <Icon icon={CircleHelp} className="h-[18px] w-[18px]" /> {t("tour.replay")}
                  </button>
                  <Link
                    href="/help/contact"
                    onClick={() => setProfileOpen(false)}
                    className="inline-flex items-center gap-2.5"
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 8, fontSize: ".9rem", textDecoration: "none", color: "var(--ink)" }}
                  >
                    <Icon icon={LifeBuoy} className="h-[18px] w-[18px]" /> {t("nav.contactTeam")}
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
              {[
                { labelKey: "grp.settings" as MessageKey, items: hubs as NavEntry[] },
                { labelKey: "grp.platform" as MessageKey, items: platform },
              ].map((g) => {
                const items = g.items;
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
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: ".68rem", color: "var(--ink-3)", fontWeight: 700, letterSpacing: ".06em", padding: "4px 12px 6px", textTransform: "uppercase" }}>
                  {t("grp.help")}
                </div>
                <button
                  onClick={() => { setMenuOpen(false); window.dispatchEvent(new Event(TOUR_START_EVENT)); }}
                  className="inline-flex items-center gap-3"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 9, fontSize: ".95rem", fontWeight: 500, border: "none", background: "transparent", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                >
                  <Icon icon={CircleHelp} className="h-[19px] w-[19px]" /> {t("tour.replay")}
                </button>
                <Link
                  href="/help/contact"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex items-center gap-3"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 9, fontSize: ".95rem", textDecoration: "none", fontWeight: 500, color: "var(--ink)" }}
                >
                  <Icon icon={LifeBuoy} className="h-[19px] w-[19px]" /> {t("nav.contactTeam")}
                </Link>
              </div>
            </nav>
          </aside>
        </div>
      )}

      <TourGuide userId={userId} />
      <main style={{ maxWidth: "var(--krok-page-w)", margin: "0 auto", padding: "20px var(--krok-gutter) 90px" }}>{children}</main>
    </>
  );
}

function Avatar({ url, size }: { url: string; size: number }) {
  if (url)
    return <img src={url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }} />;
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent-text)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
      <Icon icon={HardHat} className="h-3.5 w-3.5" />
    </span>
  );
}
