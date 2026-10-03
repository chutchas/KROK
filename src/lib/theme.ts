// ============================================================
// ธีมสี + โลโก้ของฟอร์ม
// ลำดับ: ค่าเริ่มต้นของแอป ← ธีมของ workspace (tenant_branding) ← ธีมของฟอร์ม (schema.theme)
// ใช้ทั้งหน้ากรอก (มือถือ/สาธารณะ), มุมมองกระดาษ/พิมพ์ และ PDF
// ============================================================

/** ธีมที่เก็บได้ (workspace หรือฟอร์ม) — ค่าที่ไม่ระบุ = ใช้ระดับก่อนหน้า */
export interface ThemeSettings {
  /** สีหลัก: ปุ่ม แถบความคืบหน้า ลิงก์/ไฮไลต์ */
  primary?: string;
  /** สีแถบหัว (หัวฟอร์มบนมือถือ, เส้นใต้ชื่อเอกสาร, หัว PDF) */
  header?: string;
  /** ข้อความท้ายเอกสาร (ที่อยู่บริษัท รหัสเอกสาร ฯลฯ) */
  footer_text?: string;
}

/** ธีมของฟอร์ม: + การแสดงโลโก้ */
export interface FormTheme extends ThemeSettings {
  /** โลโก้: workspace (ค่าเริ่มต้น) · custom = ใช้ logo_url ของฟอร์ม · none = ไม่แสดง */
  logo?: "workspace" | "custom" | "none";
  logo_url?: string;
}

export interface WorkspaceBranding extends ThemeSettings {
  logo_url?: string | null;
}

/** ธีมที่ใช้จริงหลังรวมทุกระดับ */
export interface ResolvedTheme {
  primary: string;
  header: string;
  headerInk: string;
  footer: string;
  logo: string | null;
  /** มีการตั้งธีมเอง (ไม่ใช่สีของแอป) */
  custom: boolean;
}

export const DEFAULT_PRIMARY = "#2f6fe0";
export const DEFAULT_HEADER = "#0f172a";
const HEX = /^#[0-9a-f]{6}$/i;

export function cleanHex(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (HEX.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return undefined;
}

/** ที่อยู่ไฟล์ใน bucket branding (Supabase Storage แบบสาธารณะ) */
export const BRANDING_PATH = "/storage/v1/object/public/branding/";

/**
 * URL รูปที่ยอมรับ: https + ไฟล์ใน bucket branding ของ Supabase โปรเจกต์นี้เท่านั้น
 * (กันรูปจากเว็บภายนอกที่ใช้ติดตาม IP ผู้กรอกฟอร์มสาธารณะ / เปลี่ยนเนื้อหาภายหลังได้)
 */
export function cleanImageUrl(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > 600) return undefined;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || !u.pathname.startsWith(BRANDING_PATH) || u.search || u.hash) return undefined;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (base) {
      try { if (new URL(base).host !== u.host) return undefined; } catch { /* ค่า env เพี้ยน → ตรวจแค่ path */ }
    }
    return u.toString();
  } catch {
    return undefined;
  }
}

export function sanitizeThemeSettings(raw: unknown): ThemeSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const t: ThemeSettings = {};
  const p = cleanHex(o.primary); if (p) t.primary = p;
  const h = cleanHex(o.header); if (h) t.header = h;
  const f = typeof o.footer_text === "string" ? o.footer_text.trim().slice(0, 300) : "";
  if (f) t.footer_text = f;
  return t;
}

export function sanitizeFormTheme(raw: unknown): FormTheme | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const t: FormTheme = sanitizeThemeSettings(o);
  if (o.logo === "none" || o.logo === "custom") t.logo = o.logo;
  const url = cleanImageUrl(o.logo_url);
  if (url) t.logo_url = url;
  if (t.logo === "custom" && !t.logo_url) delete t.logo;
  return Object.keys(t).length ? t : undefined;
}

// ---- สี ----
function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function toHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("");
}
export function luminance(hex: string): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** ผสมสีกับขาว/ดำ (t = สัดส่วนของสีที่ผสมเข้าไป 0–1) */
export function mix(hex: string, withHex: string, t: number): string {
  const a = rgb(hex); const b = rgb(withHex);
  return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}
/** ตัวอักษรบนพื้นสีนี้: ขาวหรือดำ แล้วแต่อันไหนอ่านง่ายกว่า */
export const inkOn = (bg: string) => (contrast(bg, "#ffffff") >= contrast(bg, "#111111") ? "#ffffff" : "#111111");
/** ทำให้สีอ่านได้บนพื้น bg (contrast ≥ min) โดยค่อย ๆ เข้ม/สว่างขึ้น */
export function readableOn(color: string, bg: string, min = 4.5): string {
  if (contrast(color, bg) >= min) return color;
  const toward = luminance(bg) > 0.5 ? "#000000" : "#ffffff";
  for (let t = 0.1; t <= 1; t += 0.1) {
    const c = mix(color, toward, t);
    if (contrast(c, bg) >= min) return c;
  }
  return toward;
}

export function resolveTheme(ws: WorkspaceBranding | null | undefined, form: FormTheme | null | undefined): ResolvedTheme {
  const primary = form?.primary ?? ws?.primary ?? DEFAULT_PRIMARY;
  const header = form?.header ?? ws?.header ?? DEFAULT_HEADER;
  const footer = form?.footer_text ?? ws?.footer_text ?? "";
  const logo = form?.logo === "none" ? null : form?.logo === "custom" ? form.logo_url ?? null : ws?.logo_url ?? null;
  const custom = !!(form?.primary || form?.header || ws?.primary || ws?.header);
  return { primary, header, headerInk: inkOn(header), footer, logo, custom };
}

/**
 * ตัวแปร CSS ของธีม (ครอบส่วนหน้ากรอก) — ส่วนประกอบทั้งหมดที่ใช้ var(--accent…) เปลี่ยนสีตามเอง
 * โหมดมืด: สีตัวอักษรของธีมสว่างขึ้นให้อ่านได้บนพื้นเข้ม
 */
export function themeCss(scope: string, t: ResolvedTheme): string {
  if (!t.custom) return "";
  const p = t.primary;
  const light = `--accent:${p};--accent-ink:${inkOn(p)};--accent-soft:${mix(p, "#ffffff", 0.88)};--accent-text:${readableOn(p, "#ffffff")};--brand-primary:${p};`;
  const dark = `--accent-soft:${mix(p, "#182335", 0.8)};--accent-text:${readableOn(p, "#182335")};`;
  return `${scope}{${light}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) ${scope}{${dark}}}` +
    `:root[data-theme="dark"] ${scope}{${dark}}`;
}
