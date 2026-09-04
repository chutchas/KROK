"use client";
import { useT } from "@/i18n/LanguageProvider";

export default function LanguageToggle() {
  const { lang, setLang } = useT();
  const other = lang === "th" ? "en" : "th";
  return (
    <button
      onClick={() => setLang(other)}
      aria-label="language"
      title={lang === "th" ? "เปลี่ยนเป็นภาษาอังกฤษ" : "Switch to Thai"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-semibold shadow-sm"
      style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit" }}
    >
      {lang === "th" ? "TH" : "EN"}
    </button>
  );
}
