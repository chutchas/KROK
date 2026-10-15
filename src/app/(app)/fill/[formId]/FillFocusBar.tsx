"use client";
import Icon from "@/components/Icon";
import { X } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import OfflineSync from "@/components/OfflineSync";
import OverflowMenu, { type MenuItem } from "@/components/OverflowMenu";

/** ความกว้างคอลัมน์ของหน้ากรอกแบบเต็มจอ (จอคอม) — มือถือเต็มจอ */
export const FOCUS_COL_W = 720;
/** ความสูงแถบปุ่มล่าง (ไม่รวม safe area) — ใช้เว้นที่ท้ายเนื้อหาไม่ให้ถูกบัง */
const ACTION_BAR_H = 68;
/** กว้างเท่าคอลัมน์เนื้อหา + gutter สองข้าง → ขอบซ้าย-ขวาของแถบตรงกับเนื้อหา */
const barInnerW = (w: number | string) => `calc(${typeof w === "number" ? `${w}px` : w} + 2 * var(--krok-gutter))`;

export type FocusMenuItem = MenuItem;

/**
 * แถบบนของหน้ากรอกแบบเต็มจอ: ชื่อฟอร์ม (ตัดท้าย) · ขั้นที่ x/N · เมนู ⋯ · ปุ่ม X ออก
 * ปุ่มทุกตัวสูง ≥44px (กดด้วยนิ้วโป้งได้) · ติดขอบบนตอนเลื่อน
 */
export function FillTopBar({
  title, stepLabel, onClose, closing, menu, colWidth = FOCUS_COL_W, status,
}: {
  title: string;
  stepLabel?: string;
  onClose: () => void;
  closing?: boolean;
  menu: FocusMenuItem[];
  colWidth?: number | string;
  /** ข้อความเล็กใต้ชื่อ (เช่น เวลาที่บันทึกร่างล่าสุด) */
  status?: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <div
      className="no-print"
      style={{
        position: "sticky", top: 0, zIndex: 30,
        // ชิดขอบจอทั้งสองข้าง (เนื้อหาหลักมี gutter) — พื้นหลังเต็มความกว้าง เนื้อหาอยู่กลางคอลัมน์
        margin: "0 calc(-1 * var(--krok-gutter)) 14px",
        background: "var(--surface)", borderBottom: "1px solid var(--line)",
      }}
    >
      <div style={{ maxWidth: barInnerW(colWidth), margin: "0 auto", padding: "6px var(--krok-gutter)", display: "flex", alignItems: "center", gap: 6, minHeight: 56 }}>
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div title={title} style={{ fontWeight: 600, fontSize: ".95rem", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          {(stepLabel || status) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".76rem", color: "var(--ink-3)", lineHeight: 1.3, minWidth: 0 }}>
              {stepLabel && <span style={{ flex: "0 0 auto", fontVariantNumeric: "tabular-nums" }}>{stepLabel}</span>}
              {status && <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{status}</span>}
            </div>
          )}
        </div>
        {/* สถานะออฟไลน์/คิวรอส่ง — แถบเมนูหลักถูกซ่อนในโหมดโฟกัส หน้ากรอกจึงต้องแสดงเอง (ซ่อนตัวเองเมื่อออนไลน์และไม่มีคิว) */}
        <OfflineSync />
        {menu.length > 0 && <OverflowMenu items={menu} tour="fill-more" />}
        <button
          type="button"
          onClick={onClose}
          disabled={closing}
          aria-label={t("fill.focus.close")}
          title={t("fill.focus.close")}
          style={{ ...iconBtn, opacity: closing ? 0.5 : 1, cursor: closing ? "default" : "pointer" }}
        >
          <Icon icon={X} className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 44, height: 44, flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center",
  border: "none", borderRadius: 10, background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit",
};

/**
 * แถบปุ่มล่าง (ก่อนหน้า / ถัดไป / ส่ง) ติดขอบล่างจอ — อยู่ในระยะนิ้วโป้งเสมอ แม้ขั้นจะยาว
 * วางตัวเว้นที่ (spacer) ไว้ท้ายเนื้อหาด้วย เนื้อหาสุดท้ายจะได้ไม่ถูกแถบบัง
 */
export function FillActionBar({ children, colWidth = FOCUS_COL_W, themeScope }: {
  children: React.ReactNode;
  colWidth?: number | string;
  /** className ของธีมฟอร์ม — แถบนี้ fixed อยู่นอกกล่องฟอร์ม ต้องใส่ scope เองให้ปุ่มได้สีธีม */
  themeScope?: string;
}) {
  const { t } = useT();
  return (
    <>
      <div aria-hidden style={{ height: `calc(${ACTION_BAR_H}px + env(safe-area-inset-bottom, 0px))` }} />
      <div
        role="region"
        aria-label={t("fill.focus.actions")}
        className={themeScope ? `no-print ${themeScope}` : "no-print"}
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30,
          background: "var(--surface)", borderTop: "1px solid var(--line)",
          boxShadow: "0 -4px 16px rgba(10,14,18,.06)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div style={{ maxWidth: barInnerW(colWidth), margin: "0 auto", padding: "8px var(--krok-gutter)", minHeight: ACTION_BAR_H, display: "flex", gap: 10, alignItems: "center", boxSizing: "border-box" }}>
          {children}
        </div>
      </div>
    </>
  );
}
