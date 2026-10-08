"use client";
import { useEffect, useId, useRef, useState } from "react";
import Icon, { type IconType } from "@/components/Icon";
import { X, MoreHorizontal, Check } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

/** ความกว้างคอลัมน์ของหน้ากรอกแบบเต็มจอ (จอคอม) — มือถือเต็มจอ */
export const FOCUS_COL_W = 720;
/** ความสูงแถบปุ่มล่าง (ไม่รวม safe area) — ใช้เว้นที่ท้ายเนื้อหาไม่ให้ถูกบัง */
const ACTION_BAR_H = 68;
/** กว้างเท่าคอลัมน์เนื้อหา + gutter สองข้าง → ขอบซ้าย-ขวาของแถบตรงกับเนื้อหา */
const barInnerW = (w: number | string) => `calc(${typeof w === "number" ? `${w}px` : w} + 2 * var(--krok-gutter))`;

export type FocusMenuItem = {
  key: string;
  label: string;
  icon?: IconType;
  onSelect: () => void;
  /** รายการแบบเลือกหนึ่งอย่าง (เช่น มุมมองมือถือ/กระดาษ) — มีค่า = แสดงเครื่องหมายถูก */
  checked?: boolean;
  disabled?: boolean;
  /** เส้นคั่นก่อนรายการนี้ */
  separator?: boolean;
};

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
        {menu.length > 0 && <OverflowMenu items={menu} />}
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

/** เมนู ⋯ — ปิดเมื่อกด Esc / แตะนอกเมนู / เลือกรายการ · ลูกศรขึ้น-ลงเลื่อนรายการ */
function OverflowMenu({ items }: { items: FocusMenuItem[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    // เปิดแล้วโฟกัสรายการแรกที่กดได้ (คีย์บอร์ด/โปรแกรมอ่านหน้าจอ)
    listRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const btns = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (!btns.length) return;
    const cur = btns.indexOf(document.activeElement as HTMLButtonElement);
    const nextIdx = e.key === "Home" ? 0 : e.key === "End" ? btns.length - 1
      : e.key === "ArrowDown" ? (cur + 1) % btns.length : (cur - 1 + btns.length) % btns.length;
    btns[nextIdx].focus();
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: "0 0 auto" }}>
      <button
        ref={btnRef}
        type="button"
        data-tour="fill-more"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("fill.focus.more")}
        title={t("fill.focus.more")}
        style={{ ...iconBtn, background: open ? "var(--accent-soft)" : "transparent", color: open ? "var(--accent)" : "var(--ink-2)" }}
      >
        <Icon icon={MoreHorizontal} className="h-6 w-6" />
      </button>
      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={t("fill.focus.more")}
          onKeyDown={onListKey}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40,
            minWidth: 220, maxWidth: "calc(100vw - 24px)",
            background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 6,
          }}
        >
          {items.map((it) => (
            <div key={it.key}>
              {it.separator && <div role="separator" style={{ height: 1, background: "var(--line)", margin: "4px 2px" }} />}
              <button
                type="button"
                role={it.checked === undefined ? "menuitem" : "menuitemradio"}
                aria-checked={it.checked}
                disabled={it.disabled}
                onClick={() => { setOpen(false); btnRef.current?.focus(); it.onSelect(); }}
                style={{
                  width: "100%", minHeight: 44, display: "flex", alignItems: "center", gap: 10, padding: "0 12px",
                  border: "none", borderRadius: 8, background: it.checked ? "var(--accent-soft)" : "transparent",
                  color: it.checked ? "var(--accent-text)" : "var(--ink)", fontWeight: it.checked ? 600 : 400,
                  fontFamily: "inherit", fontSize: ".92rem", textAlign: "left",
                  cursor: it.disabled ? "default" : "pointer", opacity: it.disabled ? 0.5 : 1,
                }}
              >
                <span style={{ width: 18, display: "inline-flex", justifyContent: "center", flex: "0 0 auto" }}>
                  {it.icon ? <Icon icon={it.icon} className="h-[18px] w-[18px]" /> : it.checked ? <Icon icon={Check} className="h-4 w-4" /> : null}
                </span>
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.icon && it.checked && <Icon icon={Check} className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * แถบปุ่มล่าง (ก่อนหน้า / ถัดไป / ส่ง) ติดขอบล่างจอ — อยู่ในระยะนิ้วโป้งเสมอ แม้ขั้นจะยาว
 * วางตัวเว้นที่ (spacer) ไว้ท้ายเนื้อหาด้วย เนื้อหาสุดท้ายจะได้ไม่ถูกแถบบัง
 */
export function FillActionBar({ children, colWidth = FOCUS_COL_W }: { children: React.ReactNode; colWidth?: number | string }) {
  const { t } = useT();
  return (
    <>
      <div aria-hidden style={{ height: `calc(${ACTION_BAR_H}px + env(safe-area-inset-bottom, 0px))` }} />
      <div
        role="region"
        aria-label={t("fill.focus.actions")}
        className="no-print"
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
