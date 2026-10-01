"use client";
// ============================================================
// KROK · ช่องแก้สูตร (หน้า editor)
// พิมพ์เองได้ หรือกดปุ่มแทรกชื่อฟิลด์/คอลัมน์ และสูตรมาตรฐาน
// แสดงเป็นชื่อ [ชื่อฟิลด์] แต่เก็บเป็น {id} — เปลี่ยนชื่อฟิลด์ภายหลังสูตรไม่พัง
// สูตรผิด → แจ้งทันที และไม่บันทึกลง schema (คงสูตรล่าสุดที่ถูกไว้)
// ============================================================
import { useRef, useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import { fromDisplay, insertables, toDisplay, type FormulaCtx } from "@/lib/formula";

const OPS = ["+", "-", "×", "÷", "(", ")"];
const FUNCS: { label: string; snippet: string }[] = [
  { label: "SUM", snippet: "SUM()" },
  { label: "AVG", snippet: "AVG()" },
  { label: "MIN", snippet: "MIN()" },
  { label: "MAX", snippet: "MAX()" },
  { label: "COUNT", snippet: "COUNT()" },
  { label: "ROUND", snippet: "ROUND(, 2)" },
  { label: "ABS", snippet: "ABS()" },
  { label: "IF", snippet: "IF(, , )" },
];

export default function FormulaInput({ value, ctx, onChange }: { value: string | undefined; ctx: FormulaCtx; onChange: (stored: string) => void }) {
  const { t } = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  // ข้อความที่ผู้ใช้กำลังแก้ — null = ยังไม่ได้แก้ ใช้ค่าจาก schema (ชื่อฟิลด์ที่เปลี่ยนจะอัปเดตตามเอง)
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? toDisplay(value, ctx);
  const res = text.trim() ? fromDisplay(text, ctx) : null;
  const items = insertables(ctx);

  function commit(next: string) {
    const r = fromDisplay(next, ctx);
    if ("stored" in r) { onChange(r.stored); setDraft(null); }
    else setDraft(next);
  }

  // inside = วางเคอร์เซอร์ไว้ในวงเล็บของฟังก์ชันที่แทรก
  function insert(snippet: string, inside = false) {
    const el = ref.current;
    const op = snippet === "×" ? "*" : snippet === "÷" ? "/" : snippet;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const ins = /^[+\-*/]$/.test(op) ? ` ${op} ` : op;
    commit(text.slice(0, start) + ins + text.slice(end));
    const caret = start + (inside ? ins.indexOf("(") + 1 : ins.length);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret, caret); });
  }

  const chip: React.CSSProperties = {
    border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", borderRadius: 7, padding: "4px 8px",
    cursor: "pointer", fontFamily: "inherit", fontSize: ".78rem", lineHeight: 1.3, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  };

  return (
    <div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => { if (res && "stored" in res) setDraft(null); }}
        rows={2}
        spellCheck={false}
        placeholder={ctx.rowColumns ? t("formula.phRow") : t("formula.ph")}
        aria-label={t("formula.label")}
        style={{
          width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, resize: "vertical",
          border: `1px solid ${res && "error" in res ? "var(--fail)" : "var(--line)"}`, background: "var(--surface)", color: "var(--ink)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: ".84rem", lineHeight: 1.5,
        }}
      />
      {res && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 5, fontSize: ".76rem", marginTop: 4, color: "error" in res ? "var(--fail)" : "var(--pass)" }}>
          <Icon icon={"error" in res ? TriangleAlert : CheckCircle2} className="h-3.5 w-3.5" />
          <span>{"error" in res ? res.error : t("formula.ok")}</span>
        </div>
      )}

      <div style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--ink-3)", margin: "8px 0 4px" }}>{ctx.rowColumns ? t("formula.insertCol") : t("formula.insertField")}</div>
      {items.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {items.map((it) => (
            <button key={it.token} type="button" onClick={() => insert(it.token)} title={it.token}
              style={{ ...chip, color: "var(--accent)", borderColor: "color-mix(in srgb, var(--accent) 40%, var(--line))", background: "var(--accent-soft)" }}>
              {it.group === "column" && !ctx.rowColumns ? `Σ ${it.label}` : it.label}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>{ctx.rowColumns ? t("formula.noNumCol") : t("formula.noNumField")}</div>
      )}

      <div style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--ink-3)", margin: "8px 0 4px" }}>{t("formula.funcs")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {OPS.map((o) => <button key={o} type="button" onClick={() => insert(o)} style={{ ...chip, minWidth: 30, fontWeight: 700 }}>{o}</button>)}
        {FUNCS.map((f) => <button key={f.label} type="button" onClick={() => insert(f.snippet, true)} title={t(`formula.fn.${f.label}` as never)} style={{ ...chip, fontFamily: "ui-monospace, monospace" }}>{f.label}</button>)}
      </div>
      <p style={{ fontSize: ".72rem", color: "var(--ink-3)", margin: "6px 0 0", lineHeight: 1.5 }}>{ctx.rowColumns ? t("formula.helpRow") : t("formula.help")}</p>
    </div>
  );
}
