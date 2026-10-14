"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { CircleHelp, ChevronRight } from "lucide-react";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import { helpArticle } from "@/lib/help-articles";

/**
 * "วิธีใช้" ข้างฟีเจอร์ที่ซับซ้อน — กดแล้วกางขั้นตอนสั้น ๆ ในหน้าเดิม (ไม่ต้องออกจากงาน) + ลิงก์อ่านต่อใน /help
 * กางแบบ inline (ไม่ใช่ popover ลอย) — ไม่ล้นจอบนมือถือ ไม่บังช่องที่กำลังตั้ง
 */
export default function HelpTip({ id, compact = false }: { id: string; compact?: boolean }) {
  const a = helpArticle(id);
  const { lang } = useT();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!a) return null;
  const L = lang === "en" ? "en" : "th";
  return (
    <span style={{ display: "contents" }}>
      <button type="button" className="no-print" data-krok-keep="" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}
        title={a.title[L]}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 32, minWidth: 32, padding: compact ? "0 4px" : "0 8px", border: "none", borderRadius: 8,
          background: open ? "var(--accent-soft)" : "transparent", color: "var(--accent-text)", fontFamily: "inherit", fontSize: ".8rem", fontWeight: 600, cursor: "pointer", verticalAlign: "middle" }}>
        <Icon icon={CircleHelp} className="h-4 w-4" />{!compact && <span>{L === "en" ? "How to" : "วิธีใช้"}</span>}
        {compact && <span className="sr-only">{L === "en" ? "How to" : "วิธีใช้"}</span>}
      </button>
      {open && (
        <span id={panelId} className="no-print" role="region" aria-label={a.title[L]} data-krok-keep=""
          style={{ display: "block", flexBasis: "100%", width: "100%", boxSizing: "border-box", margin: "6px 0 8px", padding: "10px 12px", borderRadius: 10,
            border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)", background: "var(--accent-soft)", color: "var(--ink)", fontSize: ".84rem", lineHeight: 1.55, fontWeight: 400, textAlign: "left" }}>
          <b style={{ display: "block", marginBottom: 4 }}>{a.title[L]}</b>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {a.steps[L].map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          {a.notes && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--ink-2)" }}>
              {a.notes[L].map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}
          <Link href={`/help#${a.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 2, marginTop: 6, minHeight: 32, color: "var(--accent-text)", fontWeight: 600 }}>
            {L === "en" ? "Open the guide" : "เปิดคู่มือ"} <Icon icon={ChevronRight} className="h-3.5 w-3.5" />
          </Link>
        </span>
      )}
    </span>
  );
}
