import type { CSSProperties, ReactNode } from "react";
import HelpTip from "./HelpTip";

/**
 * หัวหน้าเพจ / หัวส่วน — แบบเดียวทั้งแอป
 * แถว wrap เดียว: ชื่อ · ไอคอนวิธีใช้ (ข้างชื่อเสมอ) · ปุ่มชิดขวา
 * บรรทัดถัดไป: คำบรรยาย (order 1) · panel วิธีใช้กางเต็มความกว้าง (order 2)
 * h1 = 1.4rem (หัวหน้าเพจ) · h2 = 1.1rem (หัวส่วนในหน้า)
 */
export default function PageHeader({ title, help, actions, subtitle, as = "h1", tour, style }: {
  title: ReactNode;
  /** id บทความใน help-articles — มี = ไอคอน ? ข้างชื่อ */
  help?: string;
  /** ปุ่ม/ลิงก์ชิดขวา */
  actions?: ReactNode;
  subtitle?: ReactNode;
  as?: "h1" | "h2";
  /** data-tour ของหัวข้อ (ทัวร์แนะนำ) */
  tour?: string;
  style?: CSSProperties;
}) {
  const H = as;
  const h1 = as === "h1";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px 8px", flexWrap: "wrap", minWidth: 0, ...style }}>
      <H data-tour={tour} style={{ fontSize: h1 ? "var(--fs-h1)" : "var(--fs-h2)", lineHeight: 1.3, margin: 0, minWidth: 0 }}>{title}</H>
      {help && <HelpTip id={help} compact panelOrder={2} />}
      {actions && <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{actions}</div>}
      {subtitle && <div style={{ flexBasis: "100%", order: 1, color: "var(--ink-2)", fontSize: h1 ? ".9rem" : ".86rem", lineHeight: 1.55 }}>{subtitle}</div>}
    </div>
  );
}
