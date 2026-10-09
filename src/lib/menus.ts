// รายการเมนูภายใน workspace ที่คุมสิทธิ์ได้ (role กำหนดจาก DB: tenant_roles)
import type { MessageKey } from "@/i18n/dictionaries";

export type MenuKey =
  | "studio"
  | "datasets"
  | "forms"
  | "approvals"
  | "dashboard"
  | "reports"
  | "team"
  | "billing"
  | "integrations";

// enum ความปลอดภัยข้างใต้ (ยังใช้กับ RLS) — role ที่แสดงจริงมาจาก tenant_roles
export type Role = "owner" | "admin" | "designer" | "operator";

export interface MenuDef {
  key: MenuKey;
  href: string;
  labelKey: MessageKey;
}

export const MENUS: MenuDef[] = [
  { key: "studio", href: "/studio", labelKey: "nav.studio" },
  { key: "datasets", href: "/datasets", labelKey: "nav.datasets" },
  { key: "forms", href: "/forms", labelKey: "nav.fill" },
  { key: "approvals", href: "/approvals", labelKey: "nav.approvals" },
  { key: "dashboard", href: "/dashboard", labelKey: "nav.dashboard" },
  { key: "reports", href: "/reports", labelKey: "nav.reports" },
  { key: "team", href: "/settings/team", labelKey: "nav.team" },
  { key: "billing", href: "/settings/billing", labelKey: "nav.billing" },
  { key: "integrations", href: "/settings/integrations", labelKey: "nav.integrations" },
];

export const ALL_MENU_KEYS: MenuKey[] = MENUS.map((m) => m.key);

/**
 * เมนูที่ทุกคนใน workspace มีเสมอ (ตั้งปิดใน role ไม่ได้)
 * รายงาน: สมาชิกทั่วไปเห็นเฉพาะเอกสารที่ตัวเองส่ง (RLS 0079) = ประวัติการส่งของตัวเอง · ผู้จัดการเห็นทั้ง workspace
 */
export const ALWAYS_MENUS: MenuKey[] = ["reports"];
export const withAlwaysMenus = (m: MenuKey[]): MenuKey[] => Array.from(new Set([...m, ...ALWAYS_MENUS]));

/** normalize ค่า menus จาก DB ให้เหลือเฉพาะคีย์ที่ถูกต้อง */
export function cleanMenus(raw: unknown): MenuKey[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set(ALL_MENU_KEYS as string[]);
  return Array.from(new Set(raw.filter((x): x is MenuKey => typeof x === "string" && set.has(x))));
}
