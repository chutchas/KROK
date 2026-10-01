"use client";
// ============================================================
// KROK · ตัวเลือกไอคอนฟอร์ม — ปุ่มแสดงไอคอนปัจจุบัน กดแล้วเปิดแผงเลือก
// ค้นหาได้ (ไทย/อังกฤษ) · แบ่งกลุ่มตามลักษณะงาน / อุตสาหกรรม · Esc หรือคลิกนอกแผง = ปิด
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { Search as SearchIcon, Layers, Factory } from "lucide-react";
import FormIcon from "@/components/FormIcon";
import { ICON_GROUPS, ICONS, resolveIconKey, iconDef } from "@/lib/form-icons";
import { useT } from "@/i18n/LanguageProvider";

export default function IconPicker({ value, onChange, size = 44 }: { value: string; onChange: (v: string) => void; size?: number }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"task" | "industry">("task");
  const boxRef = useRef<HTMLDivElement>(null);
  const current = resolveIconKey(value);
  const label = (k: string) => { const d = iconDef(k); return d ? (lang === "en" ? d.en : d.th) : k; };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // ค้นหา: แสดงผลรวมไม่แบ่งกลุ่ม (จับทั้งชื่อไทย อังกฤษ และชื่อกลุ่ม)
  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return null;
    return ICONS.filter((i) => {
      const groups = ICON_GROUPS.filter((g) => g.icons.includes(i.key)).map((g) => `${g.th} ${g.en}`).join(" ");
      return `${i.key} ${i.th} ${i.en} ${groups}`.toLowerCase().includes(n);
    }).map((i) => i.key);
  }, [q]);

  function pick(k: string) { onChange("i:" + k); setOpen(false); setQ(""); }

  const cell = (k: string) => {
    const on = k === current;
    return (
      <button key={k} type="button" onClick={() => pick(k)} title={label(k)} aria-label={label(k)} aria-pressed={on}
        style={{ border: on ? "2px solid var(--accent)" : "1px solid transparent", borderRadius: 10, padding: 2, background: "transparent", cursor: "pointer", lineHeight: 0 }}>
        <FormIcon value={"i:" + k} size={36} />
      </button>
    );
  };

  return (
    <div ref={boxRef} style={{ position: "relative", flex: "0 0 auto" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open} title={`${t("icon.change")} · ${label(current)}`}
        style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 3, background: "var(--surface)", cursor: "pointer", lineHeight: 0 }}>
        <FormIcon value={value} size={size} />
      </button>

      {open && (
        <div role="dialog" aria-label={t("icon.pick")}
          style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 60, width: 340, maxWidth: "calc(100vw - 32px)", background: "var(--surface)",
            border: "1px solid var(--line)", borderRadius: 14, boxShadow: "0 14px 40px rgba(10,14,18,.2)", padding: 12 }}>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }}><Icon icon={SearchIcon} className="h-4 w-4" /></span>
            <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("icon.search")} aria-label={t("icon.search")}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem" }} />
          </div>

          {!results && (
            <div style={{ display: "flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
              {([{ k: "task" as const, icon: Layers, l: t("icon.byTask") }, { k: "industry" as const, icon: Factory, l: t("icon.byIndustry") }]).map((x, i) => (
                <button key={x.k} type="button" onClick={() => setKind(x.k)} aria-pressed={kind === x.k}
                  style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 8px", border: "none", borderLeft: i ? "1px solid var(--line)" : "none", cursor: "pointer", fontFamily: "inherit", fontSize: ".8rem",
                    background: kind === x.k ? "var(--accent-soft)" : "var(--surface)", color: kind === x.k ? "var(--accent)" : "var(--ink-2)", fontWeight: kind === x.k ? 600 : 400 }}>
                  <Icon icon={x.icon} className="h-3.5 w-3.5" /> {x.l}
                </button>
              ))}
            </div>
          )}

          <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 10 }}>
            {results ? (
              results.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{results.map(cell)}</div>
                : <p style={{ color: "var(--ink-3)", fontSize: ".85rem", margin: "8px 0", textAlign: "center" }}>{t("icon.none")}</p>
            ) : (
              ICON_GROUPS.filter((g) => g.kind === kind).map((g) => (
                <div key={g.key}>
                  <div style={{ fontSize: ".74rem", fontWeight: 700, color: "var(--ink-3)", marginBottom: 4 }}>{lang === "en" ? g.en : g.th}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{g.icons.map(cell)}</div>
                </div>
              ))
            )}
          </div>
          <div style={{ fontSize: ".76rem", color: "var(--ink-3)", marginTop: 8 }}>{label(current)}</div>
        </div>
      )}
    </div>
  );
}
