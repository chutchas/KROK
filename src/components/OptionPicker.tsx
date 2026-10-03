"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { Search, X, Check } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

// ============================================================
// OptionPicker — ตัวเลือกแบบค้นหาได้ สำหรับ dropdown ที่ดึงจากข้อมูลอ้างอิง
// (อาจมีหลายร้อย–หลายพันรายการ ซึ่ง radio list เดิมใช้ไม่ไหว)
// รายการน้อย (≤ 6) แสดงเป็น radio/checkbox เหมือนฟิลด์ปกติ
// labels (ถ้ามี) = ชื่อที่แสดงของแต่ละค่า → แสดง "ชื่อ · รหัส" ค้นหาได้ทั้งสองอย่าง แต่ค่าที่ส่งออกเป็นรหัส
// ============================================================

const SHOW_LIMIT = 60;
const INLINE_MAX = 6;

export default function OptionPicker({
  options,
  multiple = false,
  value,
  onChange,
  paper = false,
  compact = false,
  name,
  labels,
}: {
  options: string[];
  /** ค่า → ชื่อที่แสดง */
  labels?: Map<string, string>;
  multiple?: boolean;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  paper?: boolean;
  compact?: boolean;
  name: string;
}) {
  const { tt } = useT();
  const selected = useMemo(() => (multiple ? (Array.isArray(value) ? value : []) : typeof value === "string" && value ? [value] : []), [multiple, value]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.toLowerCase().includes(s) || (labels?.get(o) ?? "").toLowerCase().includes(s));
  }, [options, q, labels]);

  const codeStyle: React.CSSProperties = { fontSize: ".72em", color: paper ? "#888" : "var(--ink-3)", fontFamily: "monospace", marginLeft: 6 };
  // ชื่อ + รหัสเล็ก ๆ (ไม่มีชื่อ = แสดงค่าอย่างเดียว)
  const text = (o: string) => {
    const l = labels?.get(o);
    return l ? <>{l}<span style={codeStyle}>{o}</span></> : o;
  };

  const ink = paper ? "#111" : "var(--ink)";
  const line = paper ? "#b9bec4" : "var(--line)";
  const bg = paper ? "#fff" : "var(--surface)";
  const fs = compact ? ".82rem" : "1rem";

  function pick(o: string) {
    if (multiple) {
      const next = selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o];
      onChange(next);
    } else {
      onChange(o);
      setQ("");
      setOpen(false);
    }
  }

  // ---------- รายการน้อย: radio / checkbox ----------
  if (options.length <= INLINE_MAX) {
    return (
      <div>
        {options.map((o) => (
          <label key={o} style={{ display: "flex", alignItems: "center", gap: 10, padding: compact ? "3px 2px" : "9px 4px", color: ink, fontSize: fs }}>
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              checked={selected.includes(o)}
              onChange={() => pick(o)}
              style={{ width: compact ? 15 : 20, height: compact ? 15 : 20, accentColor: "var(--accent)" }}
            />
            <span>{text(o)}</span>
          </label>
        ))}
      </div>
    );
  }

  // ---------- รายการยาว: ช่องค้นหา + รายการ ----------
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {selected.map((s) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--accent-soft)", color: "var(--accent-text)", border: "1px solid var(--accent)", borderRadius: 999, padding: compact ? "1px 8px" : "4px 10px", fontSize: compact ? ".78rem" : ".9rem", fontWeight: 600 }}>
              {text(s)}
              <button type="button" aria-label={tt("fw.opt.remove", { name: labels?.get(s) ?? s })} onClick={() => onChange(multiple ? selected.filter((x) => x !== s) : "")} style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", padding: 0, display: "flex" }}>
                <Icon icon={X} className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: paper ? "#888" : "var(--ink-3)", display: "flex" }}>
          <Icon icon={Search} className="h-4 w-4" />
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={tt(multiple || !selected.length ? "fw.opt.searchPh" : "fw.opt.changePh", { n: options.length.toLocaleString() })}
          style={{ width: "100%", padding: compact ? "5px 8px 5px 32px" : "11px 12px 11px 34px", border: `1px solid ${line}`, borderRadius: compact ? 5 : 8, background: bg, color: ink, fontFamily: "inherit", fontSize: fs }}
        />
      </div>
      {open && (
        <div
          role="listbox"
          aria-multiselectable={multiple}
          style={{ position: "absolute", zIndex: 30, left: 0, right: 0, marginTop: 4, maxHeight: 260, overflowY: "auto", background: bg, border: `1px solid ${line}`, borderRadius: 8, boxShadow: "var(--shadow)" }}
        >
          {matches.length === 0 && <div style={{ padding: "10px 12px", color: paper ? "#888" : "var(--ink-3)", fontSize: ".88rem" }}>{tt("fw.opt.notFound", { q })}</div>}
          {matches.slice(0, SHOW_LIMIT).map((o) => {
            const on = selected.includes(o);
            return (
              <button
                type="button"
                role="option"
                aria-selected={on}
                key={o}
                onClick={() => pick(o)}
                style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, textAlign: "left", padding: compact ? "6px 10px" : "10px 12px", border: "none", borderBottom: `1px solid ${paper ? "#eee" : "var(--line)"}`, background: on ? "var(--accent-soft)" : "transparent", color: ink, cursor: "pointer", fontFamily: "inherit", fontSize: fs }}
              >
                <span style={{ width: 16, display: "flex", color: "var(--accent-text)" }}>{on && <Icon icon={Check} className="h-4 w-4" />}</span>
                <span>{text(o)}</span>
              </button>
            );
          })}
          {matches.length > SHOW_LIMIT && (
            <div style={{ padding: "8px 12px", fontSize: ".78rem", color: paper ? "#888" : "var(--ink-3)" }}>
              {tt("fw.opt.showing", { n: SHOW_LIMIT, total: matches.length.toLocaleString() })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
