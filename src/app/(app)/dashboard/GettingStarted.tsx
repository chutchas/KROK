"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, PenSquare, Smartphone, FileText } from "lucide-react";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";

const PDF_SEEN_KEY = "krok_onb_pdf";

/**
 * เริ่มต้นใช้งาน 3 ขั้น (ผู้ใช้ใหม่): สร้างฟอร์ม → ลองกรอกบนมือถือ → ดูเอกสาร A4
 * ติ๊กเองตามข้อมูลจริง · ซ่อนเมื่อครบ 3 ขั้น (ขั้น 3 = เคยกดเปิดเอกสาร จำไว้ในเครื่อง)
 */
export default function GettingStarted({ hasForms, firstSubId, canCreate }: { hasForms: boolean; firstSubId: string | null; canCreate: boolean }) {
  const { t } = useT();
  const [pdfSeen, setPdfSeen] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่าน localStorage หลัง mount (SSR ไม่มี)
      setPdfSeen(localStorage.getItem(PDF_SEEN_KEY) === "1");
    } catch { /* โหมดส่วนตัว = แสดงต่อ */ }
  }, []);
  const filled = !!firstSubId;
  if (hasForms && filled && pdfSeen) return null;

  const steps = [
    { done: hasForms, icon: PenSquare, title: t("onb.s1"), hint: t("onb.s1h"), href: canCreate ? "/studio" : undefined, cta: t("onb.s1c") },
    { done: filled, icon: Smartphone, title: t("onb.s2"), hint: t("onb.s2h"), href: hasForms ? "/forms" : undefined, cta: t("onb.s2c") },
    { done: filled && pdfSeen, icon: FileText, title: t("onb.s3"), hint: t("onb.s3h"), href: firstSubId ? `/submission/${firstSubId}` : undefined, cta: t("onb.s3c"),
      onClick: () => { try { localStorage.setItem(PDF_SEEN_KEY, "1"); } catch { /* ไม่เป็นไร */ } } },
  ];
  // ขั้นที่ต้องทำต่อ = ขั้นแรกที่ยังไม่เสร็จ
  const nextIdx = steps.findIndex((s) => !s.done);

  return (
    <section data-tour="dash-start-new" aria-labelledby="onb-h" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <h2 id="onb-h" style={{ fontSize: "1.1rem", margin: "0 0 2px" }}>{t("onb.title")}</h2>
      <p style={{ color: "var(--ink-2)", fontSize: ".88rem", margin: "0 0 12px" }}>{canCreate ? t("onb.sub") : t("onb.subNoCreate")}</p>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {steps.map((s, i) => {
          const isNext = i === nextIdx;
          return (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, border: `1px solid ${isNext ? "var(--accent)" : "var(--line)"}`, background: isNext ? "var(--accent-soft)" : "transparent" }}>
              <span aria-hidden style={{ width: 30, height: 30, flex: "0 0 auto", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: ".85rem",
                background: s.done ? "var(--pass-solid)" : "var(--surface-2)", color: s.done ? "#fff" : "var(--ink-2)", border: s.done ? "none" : "1px solid var(--line)" }}>
                {s.done ? <Icon icon={Check} className="h-4 w-4" /> : i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontSize: ".92rem", color: s.done ? "var(--ink-3)" : "var(--ink)", textDecoration: s.done ? "line-through" : "none" }}>
                  {s.title}<span className="sr-only">{s.done ? ` (${t("onb.doneSr")})` : ""}</span>
                </b>
                {!s.done && <small style={{ color: "var(--ink-3)", fontSize: ".78rem" }}>{s.hint}</small>}
              </div>
              {!s.done && s.href && (
                <Link href={s.href} onClick={s.onClick} className="inline-flex items-center gap-1.5"
                  style={{ minHeight: 44, padding: "0 14px", borderRadius: 9, flex: "0 0 auto", fontWeight: 600, fontSize: ".88rem", textDecoration: "none",
                    background: isNext ? "var(--accent)" : "var(--surface)", color: isNext ? "var(--accent-ink)" : "var(--accent-text)", border: isNext ? "none" : "1px solid var(--line)" }}>
                  <Icon icon={s.icon} className="h-4 w-4" /> {s.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
