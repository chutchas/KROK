"use client";
// ส่วนแสดงแบรนด์ของฟอร์ม (ธีมสี / โลโก้ / ข้อความท้าย) — ใช้ในหน้ากรอก มุมมองมือถือ และหน้าสร้างฟอร์ม
import { InlineFormIcon } from "@/components/FormIcon";
import { themeCss, type ResolvedTheme } from "@/lib/theme";

/** ตัวแปรสีของธีม (ครอบ element ที่มี className = scope) */
export function ThemeStyle({ scope, theme }: { scope: string; theme: ResolvedTheme }) {
  const css = themeCss(`.${scope}`, theme);
  return css ? <style>{css}</style> : null;
}

/** ฟอร์มนี้มีแบรนด์ให้แสดงไหม (ไม่มี = ใช้หัวแบบเดิมของแอป) */
export const hasBrand = (t: ResolvedTheme) => t.custom || !!t.logo;

/** แถบหัวฟอร์มตามธีม: พื้นสีแถบหัว + โลโก้ + ชื่อ/คำอธิบาย */
export function FormBrandHeader({ theme, icon, title, description, flushX = 20, flushTop = 20 }: {
  theme: ResolvedTheme; icon: string; title: string; description?: string;
  /** ชดเชย padding ของการ์ดที่ครอบ ให้แถบชิดขอบ */
  flushX?: number; flushTop?: number;
}) {
  return (
    <div style={{ background: theme.header, color: theme.headerInk, margin: `-${flushTop}px -${flushX}px 14px`, padding: `14px ${Math.max(flushX, 12)}px`, borderRadius: "12px 12px 0 0", display: "flex", alignItems: "center", gap: 12 }}>
      {theme.logo && (
        <span style={{ flex: "0 0 auto", background: "#fff", borderRadius: 8, padding: 4, display: "inline-flex" }}>
          <img src={theme.logo} alt="" style={{ height: 36, maxWidth: 120, objectFit: "contain", display: "block" }} />
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: "1.05rem", color: "inherit", overflowWrap: "anywhere" }}><InlineFormIcon value={icon} size={18} />{title}</h1>
        {description?.trim() && <p style={{ margin: "3px 0 0", fontSize: ".84rem", opacity: 0.85, lineHeight: 1.5, overflowWrap: "anywhere" }}>{description.trim()}</p>}
      </div>
    </div>
  );
}

export function FormFooterText({ text }: { text: string }) {
  if (!text) return null;
  return <div style={{ marginTop: 16, paddingTop: 10, borderTop: "1px solid var(--line)", fontSize: ".78rem", color: "var(--ink-3)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: "center" }}>{text}</div>;
}
