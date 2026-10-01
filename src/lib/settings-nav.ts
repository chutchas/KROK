// ============================================================
// KROK · โครงเมนูตั้งค่า — sidebar แสดงเป็น 4 หมวด (hub) แต่ละหมวดมีแท็บด้านบนหน้า
// ใช้ร่วม: AppShell (sidebar/navbar) และ settings/layout (แท็บในหน้า) — กติกาสิทธิ์ชุดเดียวกัน
// ============================================================
import type { MessageKey } from "@/i18n/dictionaries";
import type { MenuKey } from "@/lib/menus";

export type NavGate = "wsadmin" | "platform" | "dev";

export interface SettingsItem {
  href: string;
  /** ชื่อแท็บในหน้า */
  tabKey: MessageKey;
  menu?: MenuKey;
  gate?: NavGate;
}

export interface SettingsHub {
  key: "people" | "workspace" | "connect" | "billing";
  labelKey: MessageKey;
  items: SettingsItem[];
}

export const SETTINGS_HUBS: SettingsHub[] = [
  {
    key: "people",
    labelKey: "hub.people",
    items: [
      { href: "/settings/team", tabKey: "hub.tab.team", menu: "team" },
      { href: "/settings/roles", tabKey: "nav.roles", gate: "wsadmin" },
    ],
  },
  {
    key: "workspace",
    labelKey: "hub.workspace",
    items: [
      { href: "/settings/workspace", tabKey: "hub.tab.general", gate: "wsadmin" },
      { href: "/settings/devices", tabKey: "nav.devices", gate: "wsadmin" },
      { href: "/settings/audit", tabKey: "nav.audit", gate: "wsadmin" },
    ],
  },
  {
    key: "connect",
    labelKey: "hub.connect",
    items: [{ href: "/settings/integrations", tabKey: "nav.integrations", menu: "integrations" }],
  },
  {
    key: "billing",
    labelKey: "hub.billing",
    items: [
      { href: "/settings/billing", tabKey: "hub.tab.plan", menu: "billing" },
      { href: "/settings/billing/history", tabKey: "nav.billingHistory", gate: "wsadmin" },
    ],
  },
];

export interface NavCtx {
  allowed: ReadonlySet<string>;
  isWsAdmin: boolean;
  isPlatformAdmin: boolean;
  platformRole: string;
}

export function canSee(n: { menu?: MenuKey; gate?: NavGate }, c: NavCtx): boolean {
  if (n.gate === "platform") return c.isPlatformAdmin;
  if (n.gate === "dev") return c.isPlatformAdmin || c.platformRole === "developer";
  if (n.gate === "wsadmin") return c.isWsAdmin;
  if (n.menu) return c.allowed.has(n.menu);
  return true;
}

const matches = (path: string, href: string) => path === href || path.startsWith(href + "/");

/** หมวดของหน้านี้ + แท็บที่เปิดอยู่ (href ที่ยาวที่สุดที่ตรง) */
export function hubOf(path: string): { hub: SettingsHub; item: SettingsItem } | null {
  let best: { hub: SettingsHub; item: SettingsItem } | null = null;
  for (const hub of SETTINGS_HUBS)
    for (const item of hub.items)
      if (matches(path, item.href) && (!best || item.href.length > best.item.href.length)) best = { hub, item };
  return best;
}
