"use client";
// ============================================================
// KROK · ช่องกรอก 1 ช่องในตาราง — ใช้ร่วมทั้งหน้ากรอกปกติ (การ์ด/ตาราง) และมุมมองกระดาษ
// ค่าที่เก็บ: ผ่าน/ไม่ผ่าน = "pass" | "fail" · ติ๊กถูก = "1" | "" · วันที่ = "YYYY-MM-DDTHH:mm"
// คอลัมน์สูตร = อ่านอย่างเดียว (คำนวณจากคอลัมน์อื่นในแถว — ดู lib/formula.computeRow)
// ============================================================
import { Check, X as XIcon } from "lucide-react";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import type { TableColumn } from "@/lib/form-schema";

export type CellLook = "normal" | "small" | "paper";

export const PASS_C = "#16a34a";
export const FAIL_C = "#dc2626";

export default function TableCell({
  col, value, onChange, look, style, iconOnly = false,
}: {
  /** ผ่าน/ไม่ผ่าน แสดงแค่ไอคอน (ช่องแคบในโหมดตาราง) */
  iconOnly?: boolean;
  col: TableColumn;
  value: string;
  onChange: (v: string) => void;
  look: CellLook;
  /** สไตล์ช่องกรอกพื้นฐานจากผู้เรียก (ขนาด/สี/ขอบ) */
  style: React.CSSProperties;
}) {
  const { t } = useT();
  const paper = look === "paper";

  if (col.type === "formula") {
    return (
      <div aria-live="polite" title={t("formula.auto")}
        style={{ ...style, display: "flex", alignItems: "center", justifyContent: "flex-end", fontVariantNumeric: "tabular-nums", fontWeight: 600,
          background: paper ? "#f4f6f8" : "var(--code-bg)", color: value ? (paper ? "#111" : "var(--ink)") : (paper ? "#999" : "var(--ink-3)"), cursor: "default" }}>
        {value ? Number(value).toLocaleString("en-US", { maximumFractionDigits: col.decimals ?? 2 }) : "—"}
      </div>
    );
  }

  if (col.type === "pass_fail") {
    const btn = (k: "pass" | "fail") => {
      const on = value === k;
      const c = k === "pass" ? PASS_C : FAIL_C;
      return (
        <button type="button" aria-pressed={on} onClick={() => onChange(on ? "" : k)} aria-label={k === "pass" ? t("fw.pass") : t("fw.fail")}
          style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3, cursor: "pointer", fontFamily: "inherit",
            fontSize: paper ? ".68rem" : look === "small" ? ".76rem" : ".84rem", fontWeight: 600, padding: paper ? 0 : "4px 6px",
            borderRadius: paper ? 3 : 6, border: `1px solid ${on ? c : paper ? "#c3c8ce" : "var(--line)"}`,
            background: on ? c : paper ? "#fff" : "var(--surface)", color: on ? "#fff" : c }}>
          <Icon icon={k === "pass" ? Check : XIcon} className="h-3.5 w-3.5" />
          {!paper && !iconOnly && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k === "pass" ? t("fw.pass") : t("fw.fail")}</span>}
        </button>
      );
    };
    return (
      <div style={{ display: "flex", gap: 4, alignItems: "stretch", height: paper ? (style.height as number) : undefined, padding: paper ? "2px 3px" : 0, boxSizing: "border-box" }}>
        {btn("pass")}{btn("fail")}
      </div>
    );
  }

  if (col.type === "checkbox") {
    return (
      <label style={{ display: "flex", alignItems: "center", justifyContent: "center", height: paper ? (style.height as number) : look === "small" ? 30 : 38, cursor: "pointer" }}>
        <input type="checkbox" checked={value === "1"} onChange={(e) => onChange(e.target.checked ? "1" : "")} aria-label={col.label}
          style={{ width: paper ? 15 : 20, height: paper ? 15 : 20, accentColor: "var(--accent)", cursor: "pointer" }} />
      </label>
    );
  }

  if (col.type === "select") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} style={style} aria-label={col.label}>
        <option value="">—</option>
        {(col.options || []).map((o, i) => {
          const name = col.option_labels?.[i];
          return <option key={i} value={o}>{name ? `${name} · ${o}` : o}</option>;
        })}
      </select>
    );
  }

  if (col.type === "datetime") {
    return <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} style={{ ...style, minWidth: 0 }} aria-label={col.label} />;
  }

  return (
    <input type={col.type === "number" ? "number" : "text"} inputMode={col.type === "number" ? "decimal" : undefined}
      value={value} onChange={(e) => onChange(e.target.value)} style={style} aria-label={col.label} />
  );
}
