"use client";
import { useT } from "@/i18n/LanguageProvider";
import { Languages } from "lucide-react";
import Icon from "@/components/Icon";

/** row = แถวในเมนูโปรไฟล์ (ไอคอน + ข้อความ) */
export default function LanguageToggle({ row = false }: { row?: boolean } = {}) {
  const { lang, setLang, t } = useT();
  const other = lang === "th" ? "en" : "th";
  if (row) return (
    <button type="button" onClick={() => setLang(other)} className="inline-flex items-center gap-2.5" style={{ width: "100%", padding: "9px 10px", borderRadius: 8, fontSize: ".9rem", color: "var(--ink)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
      <Icon icon={Languages} className="h-[18px] w-[18px]" />
      <span lang={lang}>{t("lang.label")}</span>
      <span style={{ marginLeft: "auto", color: "var(--ink-3)", fontSize: ".82rem" }}>{lang === "th" ? "ไทย → English" : "English → ไทย"}</span>
    </button>
  );
  return (
    <button
      onClick={() => setLang(other)}
      aria-label="language"
      title={lang === "th" ? "เปลี่ยนเป็นภาษาอังกฤษ" : "Switch to Thai"}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border text-xs font-semibold shadow-sm"
      style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit" }}
    >
      {lang === "th" ? "TH" : "EN"}
    </button>
  );
}
