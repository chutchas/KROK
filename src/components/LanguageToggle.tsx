"use client";
import { useT } from "@/i18n/LanguageProvider";

export default function LanguageToggle() {
  const { lang, setLang } = useT();
  return (
    <div
      role="group"
      aria-label="language"
      style={{
        display: "inline-flex",
        border: "1px solid var(--line)",
        borderRadius: 20,
        overflow: "hidden",
        fontSize: ".78rem",
      }}
    >
      {(["th", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          style={{
            padding: "5px 11px",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: lang === l ? 700 : 500,
            background: lang === l ? "var(--accent)" : "transparent",
            color: lang === l ? "var(--accent-ink)" : "var(--ink-2)",
          }}
        >
          {l === "th" ? "ไทย" : "EN"}
        </button>
      ))}
    </div>
  );
}
