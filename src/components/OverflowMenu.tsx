"use client";
import { useEffect, useId, useRef, useState } from "react";
import Icon, { type IconType } from "@/components/Icon";
import { MoreHorizontal, Check } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export type MenuItem = {
  key: string;
  label: string;
  icon?: IconType;
  onSelect: () => void;
  /** รายการแบบเลือกหนึ่งอย่าง (เช่น มุมมองมือถือ/กระดาษ) — มีค่า = แสดงเครื่องหมายถูก */
  checked?: boolean;
  disabled?: boolean;
  /** เส้นคั่นก่อนรายการนี้ */
  separator?: boolean;
  /** รายการอันตราย (เช่น ลบ) — ตัวอักษรสีแดง */
  danger?: boolean;
};

const iconBtn: React.CSSProperties = {
  width: 44, height: 44, flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center",
  border: "none", borderRadius: 10, background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit",
};

/** เมนู ⋯ — ปิดเมื่อกด Esc / แตะนอกเมนู / เลือกรายการ · ลูกศรขึ้น-ลงเลื่อนรายการ */
export default function OverflowMenu({ items, label, tour, outlined }: {
  items: MenuItem[];
  /** ชื่อปุ่ม (aria-label/title) — ไม่ใส่ = "เมนูเพิ่มเติม" */
  label?: string;
  tour?: string;
  /** ปุ่มมีกรอบแบบปุ่มทั่วไป (ใช้ในแถวรายการ) — ไม่ใส่ = ปุ่มโปร่งแบบแถบบน */
  outlined?: boolean;
}) {
  const { t } = useT();
  const name = label ?? t("fill.focus.more");
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
        data-tour={tour}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={name}
        title={name}
        style={{ ...iconBtn, ...(outlined ? { border: "1px solid var(--line)", background: open ? "var(--accent-soft)" : "var(--surface)" } : { background: open ? "var(--accent-soft)" : "transparent" }), color: open ? "var(--accent-text)" : "var(--ink-2)" }}
      >
        <Icon icon={MoreHorizontal} className="h-6 w-6" />
      </button>
      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={name}
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
                  color: it.danger ? "var(--fail-text)" : it.checked ? "var(--accent-text)" : "var(--ink)", fontWeight: it.checked ? 600 : 400,
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

