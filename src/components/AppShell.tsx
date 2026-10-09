"use client";
import { getAllPending } from "@/lib/offline-queue";
import { confirmDialog } from "@/components/dialogs";
import { backdropClose } from "@/lib/backdrop";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PROFILE_AVATAR_EVENT, PROFILE_NAME_EVENT, firstName } from "@/lib/profile-events";
import TourGuide, { TourHelpButton } from "@/components/TourGuide";
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
import { PenSquare, Smartphone, ClipboardCheck, BarChart3, Users, CreditCard, Webhook, Settings, HardHat, LogOut, Menu, UsersRound, ChevronDown, X, Building2, ScrollText, Terminal, FileSpreadsheet, Database, Bug, HeartPulse, Wallet, Inbox, LifeBuoy, LayoutGrid, ShieldCheck } from "lucide-react";

type NavEntry = { href: string; key: MessageKey; icon: IconType; menu?: MenuKey; gate?: "wsadmin" | "platform" | "dev" };

// เมนูกลุ่มงานหลัก — อยู่บน navbar ครบทุกตัว (ไม่อยู่ใน sidebar) กรองตามสิทธิ์เมนูของ role
// ชื่อสั้นในแถบบน (ชื่อเต็มอยู่ใน title / เมนูข้าง / หัวหน้า) — กันแถบเมนูล้น
const NAV_SHORT: Partial<Record<MessageKey, MessageKey>> = { "hub.billing": "nav.short.billing", "hub.workspace": "nav.short.workspace", "hub.people": "nav.short.people" };

const PRIMARY: NavEntry[] = [
  { href: "/dashboard", key: "nav.dashboard", icon: BarChart3, menu: "dashboard" },
  { href: "/studio", key: "nav.studio", icon: PenSquare, menu: "studio" },
  { href: "/forms", key: "nav.fill", icon: Smartphone, menu: "forms" },
  { href: "/datasets", key: "nav.datasets", icon: Database, menu: "datasets" },
  { href: "/approvals", key: "nav.approvals", icon: ClipboardCheck, menu: "approvals" },
  { href: "/reports", key: "nav.reports", icon: FileSpreadsheet, menu: "reports" },
];

// มือถือ: แถบเมนูล่างจอ — 3 เมนูแรกที่ role นี้เห็นตามลำดับนี้ (งานหน้างานก่อน) + "เมนูเพิ่มเติม" (เปิดเมนูข้าง)
const TAB_PRIORITY = ["/forms", "/approvals", "/dashboard", "/studio", "/reports", "/datasets"];

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
  // หน้ากรอกฟอร์ม = โหมดเต็มจอ (focus): ซ่อนแถบเมนูหลัก กันพลาดกดออกกลางการตรวจ
  // หน้ากรอกมีแถบบนของตัวเอง (ชื่อฟอร์ม · ขั้นที่ · ปุ่มปิด) — ดู fill/[formId]/FillFocusBar
  const focusMode = isFocusPath(path);
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
  // เมนูข้าง: โฟกัสวนในเมนู (Tab ไม่หลุดไปหน้าหลังฉาก) · ปิดแล้วคืนโฟกัสให้ปุ่มที่เปิด
  useDialogA11y(menuRef, () => setMenuOpen(false), { active: menuOpen });
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
  const tabItems = TAB_PRIORITY.map((h) => primary.find((n) => n.href === h)).filter((n): n is NavEntry => !!n).slice(0, 3);
  // อยู่หน้าที่ไม่มีในแถบล่าง (ตั้งค่า, ชุดข้อมูล ฯลฯ) → ไฮไลต์ปุ่ม "เมนูเพิ่มเติม"
  const moreActive = !tabItems.some((n) => isActive(n.href));

  // มือถือ: แถบเมนูเลื่อนแนวนอนได้ → เลื่อนให้แท็บที่ active มาอยู่ในจอเสมอ (ไม่ต้องปัดหาเอง)
  // เลื่อนเฉพาะแถบเมนู (scrollTo) ไม่ใช้ scrollIntoView ซึ่งจะเลื่อนทั้งหน้าด้วย
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!nav || !el || nav.scrollWidth <= nav.clientWidth) return;
    // เลื่อนน้อยที่สุดพอให้แท็บที่เลือกเห็นครบ (ไม่จัดกึ่งกลาง → เมนูแรก ๆ ไม่ถูกดันออกโดยไม่จำเป็น)
    const left = el.offsetLeft - nav.offsetLeft;
    const pad = 28; // เผื่อขอบจาง
    let target = nav.scrollLeft;
    if (left - pad < nav.scrollLeft) target = left - pad;
    else if (left + el.offsetWidth + pad > nav.scrollLeft + nav.clientWidth) target = left + el.offsetWidth + pad - nav.clientWidth;
    if (target !== nav.scrollLeft) nav.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
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
        /* ชื่อ workspace: จอช่วง 641–1280px ที่เมนูแน่นที่สุด ให้แคบลง (ชื่อเต็มอยู่ใน title) */
        @media (min-width: 641px) and (max-width: 1280px){
          .krok-ws-slot .krok-ws-name{ max-width: 120px !important; }
        }
        /* มือถือ: แถบบนเหลือแถวเดียว (เมนู · โลโก้ · สถานะ/แจ้งเตือน/โปรไฟล์) — เมนูหลักไปอยู่แถบล่างจอ
           workspace + ธีม/ภาษา ย้ายไปอยู่ในเมนูข้าง (☰ / "เมนูเพิ่มเติม") */
        @media (max-width: 640px){
          .krok-topbar{ flex-wrap: nowrap !important; gap: 8px !important; }
          .krok-nav, .krok-ws-slot, .krok-desk-only, .krok-desk-only-btn{ display: none !important; }
          .krok-brand{ flex: 1 1 auto; min-width: 0; }
          .krok-controls{ flex: 0 0 auto; gap: 6px !important; }
          .krok-profile-name{ display: none !important; }
        }
        @media (min-width: 641px){
          .krok-tabbar, .krok-mobile-only{ display: none !important; }
        }
        .krok-desk-only{ display: contents; }
        /* ลิงก์ข้ามไปเนื้อหา: โผล่เมื่อกด Tab ครั้งแรก */
        .krok-skip{ position: absolute; left: 8px; top: 8px; z-index: 100; padding: 10px 14px; border-radius: 8px; background: var(--surface); color: var(--ink); font-weight: 600; text-decoration: none; transform: translateY(-200%); opacity: 0; pointer-events: none; }
        .krok-skip:focus{ transform: none; opacity: 1; pointer-events: auto; box-shadow: var(--shadow); }
        #krok-main:focus{ outline: none; }
        /* workspace ในเมนูข้าง: ปุ่มเต็มความกว้าง รายการกางในเมนูเลย (ไม่ลอยทับ) */
        .krok-drawer-ws .krok-ws-chip{ width: 100%; }
        .krok-drawer-ws .krok-ws-name{ flex: 1 1 auto; max-width: none !important; }
        .krok-drawer-ws .krok-ws-menu{ position: static !important; margin-top: 8px; box-shadow: none !important; min-width: 0 !important; }
      `}</style>
      {!focusMode && <a href="#krok-main" className="krok-skip">{t("nav.skipToContent")}</a>}
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--line)",
          position: "sticky",
          top: 0,
          zIndex: 20,
          // โหมดเต็มจอ: ซ่อนด้วย display (ไม่ถอดออก) → การแจ้งเตือน/ซิงก์คิวออฟไลน์/เตรียมออฟไลน์ ยังทำงานเบื้องหลังตามเดิม
          display: focusMode ? "none" : undefined,
        }}
        className="no-print"
        aria-hidden={focusMode || undefined}
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
          {/* มือถือ: ซ่อน (ปุ่ม "เมนูเพิ่มเติม" ในแถบล่างเปิดเมนูเดียวกัน) */}
          <button
            onClick={() => setMenuOpen(true)}
            data-tour="menu"
            className="krok-desk-only-btn inline-flex h-9 w-9 items-center justify-center rounded-xl"
            aria-label={t("nav.menu")}
            title={t("nav.menu")}
            style={{ border: "none", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", flex: "0 0 auto" }}
          >
            <Icon icon={Menu} className="h-5 w-5" />
          </button>

          <div className="krok-brand" style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
            <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flex: "0 0 auto" }} aria-label="KROK">
              <LogoMark size={28} title="KROK" />
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
                    color: on ? "var(--accent-text)" : "var(--ink-2)",
                    background: on ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <Icon icon={n.icon} className="h-[17px] w-[17px]" /> <span className="krok-nav-label">{t(NAV_SHORT[n.key] ?? n.key)}</span>
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
            <NotificationBell userId={userId} />
            <div ref={profileRef} data-tour="profile" style={{ position: "relative" }}>
              <button
                onClick={() => setProfileOpen((v) => !v)}
                title={t("nav.profile")}
                aria-label={t("nav.profile")}
                // แผงเปิด/ปิดธรรมดา (disclosure) — ข้างในเป็นลิงก์/ปุ่มทั่วไป ไม่ใช่เมนูแบบ role=menu
                aria-expanded={profileOpen}
                aria-controls="krok-profile-panel"
                className="inline-flex items-center gap-1.5"
                style={{
                  fontSize: ".8rem",
                  color: "var(--ink-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 22,
                  padding: "0 12px 0 6px",
                  minHeight: 44, // เท่ากระดิ่งข้างๆ
                  background: profileOpen ? "var(--accent-soft)" : "var(--surface)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Avatar url={shownAvatar} size={30} /><span className="krok-profile-name" title={fullName} style={{ maxWidth: "9em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName}</span>
                <Icon icon={ChevronDown} className="h-3.5 w-3.5" />
              </button>
              {profileOpen && (
                <div
                  id="krok-profile-panel"
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
                  {/* ธีม · ภาษา · แนะนำการใช้งาน — ย้ายจากแถบบน (ลดปุ่มบนแถบ) */}
                  <div style={{ display: "grid", paddingBottom: 4, borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
                    <ThemeToggle row />
                    <LanguageToggle row />
                    <span onClick={() => setProfileOpen(false)} style={{ display: "contents" }}><TourHelpButton row /></span>
                  </div>
                  <Link
                    href="/settings/profile"
                    onClick={() => setProfileOpen(false)}
                    className="inline-flex items-center gap-2.5"
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 8, fontSize: ".9rem", textDecoration: "none", color: "var(--ink)" }}
                  >
                    <Icon icon={HardHat} className="h-[18px] w-[18px]" /> {t("nav.profile")}
                  </Link>
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
                <LogoMark size={28} title="KROK" />
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
              {/* มือถือ: workspace + เมนูหลักทั้งหมด (แถบบนไม่มีที่แล้ว) */}
              <div className="krok-mobile-only">
                <div className="krok-drawer-ws" style={{ padding: "8px 4px 4px" }}>
                  {workspaces.length > 1 || canManage ? (
                    <WorkspaceSwitcher workspaces={workspaces} activeId={activeTenantId} />
                  ) : (
                    <WorkspaceChip name={tenantName} />
                  )}
                </div>
                {primary.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: ".68rem", color: "var(--ink-3)", fontWeight: 700, letterSpacing: ".06em", padding: "4px 12px 6px", textTransform: "uppercase" }}>
                      {t("nav.menu")}
                    </div>
                    {primary.map((n) => {
                      const on = isActive(n.href);
                      return (
                        <Link key={n.href} href={n.href} onClick={() => setMenuOpen(false)} aria-current={on ? "page" : undefined}
                          className="inline-flex items-center gap-3"
                          style={{ width: "100%", padding: "10px 12px", minHeight: 44, borderRadius: 9, fontSize: ".95rem", textDecoration: "none", fontWeight: on ? 600 : 500, color: on ? "var(--accent-text)" : "var(--ink)", background: on ? "var(--accent-soft)" : "transparent" }}>
                          <Icon icon={n.icon} className="h-[19px] w-[19px]" /> {t(n.key)}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
              {[
                { labelKey: "grp.settings" as MessageKey, items: hubs as NavEntry[] },
                { labelKey: "grp.platform" as MessageKey, items: platform },
              ].map((g) => {
                const items = g.items;
                if (items.length === 0) return null;
                // เมนูผู้ดูแลแพลตฟอร์ม: แยกเป็นกล่องของตัวเอง ไม่ปนกับเมนูงานปกติ
                const sys = g.labelKey === "grp.platform";
                return (
                  <div key={g.labelKey} style={sys
                    ? { marginTop: 16, padding: "6px 4px 4px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface-2)" }
                    : { marginTop: 12 }}>
                    <div style={{ fontSize: ".68rem", color: sys ? "var(--ink-2)" : "var(--ink-3)", fontWeight: 700, letterSpacing: ".06em", padding: "4px 12px 6px", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
                      {sys && <Icon icon={ShieldCheck} className="h-3.5 w-3.5" />}
                      {t(sys ? "grp.platformAdmin" : g.labelKey)}
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
                            minHeight: 44,
                            borderRadius: 9,
                            fontSize: ".95rem",
                            textDecoration: "none",
                            fontWeight: on ? 600 : 500,
                            color: on ? "var(--accent-text)" : "var(--ink)",
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

      {/* มือถือ: แถบเมนูล่างจอ (นิ้วโป้งถึง) — ซ่อนในหน้ากรอก (โหมดเต็มจอมีแถบปุ่มของตัวเอง) */}
      {!focusMode && (
        <nav className="krok-tabbar no-print" aria-label={t("nav.menu")}
          style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, background: "var(--surface)", borderTop: "1px solid var(--line)", paddingBottom: "env(safe-area-inset-bottom, 0px)", display: "flex" }}>
          {tabItems.map((n) => {
            const on = isActive(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
                style={{ flex: "1 1 0", minWidth: 0, minHeight: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, textDecoration: "none", fontSize: ".72rem", fontWeight: on ? 700 : 500, color: on ? "var(--accent-text)" : "var(--ink-2)" }}>
                <Icon icon={n.icon} className="h-[22px] w-[22px]" />
                <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px" }}>{t(NAV_SHORT[n.key] ?? n.key)}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" aria-expanded={menuOpen}
            style={{ flex: "1 1 0", minWidth: 0, minHeight: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: ".72rem", fontWeight: moreActive ? 700 : 500, color: moreActive ? "var(--accent-text)" : "var(--ink-2)" }}>
            <Icon icon={LayoutGrid} className="h-[22px] w-[22px]" />
            <span>{t("nav.more")}</span>
          </button>
        </nav>
      )}
      <TourGuide userId={userId} />
      <main id="krok-main" tabIndex={-1} style={focusMode
        // โหมดเต็มจอ: ไม่จำกัดความกว้าง (หน้ากรอกจัดคอลัมน์กลางจอเอง + แถบบนชิดขอบจอ) ไม่เว้นที่บน
        ? { margin: "0 auto", padding: "0 var(--krok-gutter) 24px" }
        : { maxWidth: "var(--krok-page-w)", margin: "0 auto", padding: "20px var(--krok-gutter) calc(40px + var(--krok-tabbar-h))" }}>{children}</main>
    </>
  );
}

/** หน้าที่แสดงแบบเต็มจอ (ไม่มีแถบเมนูหลัก) — หน้ากรอกฟอร์มที่ล็อกอิน /fill/<id> */
function isFocusPath(path: string | null): boolean {
  return !!path && path.startsWith("/fill/");
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
