"use client";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { useT } from "@/i18n/LanguageProvider";
import type { Lang } from "@/i18n/dictionaries";
import { LEGAL_EFFECTIVE_TH, LEGAL_VERSION } from "@/lib/legal";

// โครงหน้าเอกสารกฎหมาย — มีทั้งไทย/อังกฤษ แสดงตามภาษาที่ผู้ใช้เลือก (ฉบับภาษาไทยเป็นฉบับหลัก)
export type LegalSection = { id: string; title: string; body: React.ReactNode };
export type LegalContent = { title: string; intro: React.ReactNode; sections: LegalSection[]; other: { href: string; label: string } };

const UI: Record<Lang, { effective: string; version: string; toc: string; note?: string }> = {
  th: { effective: `มีผลตั้งแต่ ${LEGAL_EFFECTIVE_TH}`, version: "ฉบับ", toc: "สารบัญ" },
  en: {
    effective: `Effective ${LEGAL_VERSION}`,
    version: "Version",
    toc: "Contents",
    note: "This English version is provided for convenience. If it differs from the Thai version, the Thai version prevails.",
  },
};

export default function LegalDoc({ docs }: { docs: Record<Lang, LegalContent> }) {
  const { lang } = useT();
  const d = docs[lang] ?? docs.th;
  const ui = UI[lang] ?? UI.th;
  return (
    <div style={{ minHeight: "100vh", background: "var(--ground)", color: "var(--ink)" }}>
      <header style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)", padding: "12px 0" }} className="no-print">
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
            <LogoMark size={26} variant="compact" title="KROK" />
            <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.1rem" }}>KROK</b>
          </Link>
          <Link href={d.other.href} style={{ marginLeft: "auto", fontSize: ".86rem" }}>{d.other.label}</Link>
          <LanguageToggle />
        </div>
      </header>
      <main lang={lang} style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 80px", lineHeight: 1.75, fontSize: ".95rem" }}>
        <h1 style={{ fontSize: "1.6rem", margin: "0 0 4px" }}>{d.title}</h1>
        <div style={{ color: "var(--ink-3)", fontSize: ".82rem", marginBottom: 18 }}>
          {ui.effective} · {ui.version} {LEGAL_VERSION}
        </div>
        {ui.note && <p style={{ color: "var(--ink-3)", fontSize: ".82rem", fontStyle: "italic" }}>{ui.note}</p>}
        <div style={{ color: "var(--ink-2)" }}>{d.intro}</div>

        <nav aria-label={ui.toc} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 16px", margin: "18px 0 8px" }}>
          <b style={{ fontSize: ".86rem" }}>{ui.toc}</b>
          <ol style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: ".88rem" }}>
            {d.sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
          </ol>
        </nav>

        {d.sections.map((s, i) => (
          <section key={s.id} id={s.id} style={{ scrollMarginTop: 16 }}>
            <h2 style={{ fontSize: "1.12rem", margin: "26px 0 6px" }}>{i + 1}. {s.title}</h2>
            <div className="krok-legal-body">{s.body}</div>
          </section>
        ))}
      </main>
      <style>{`.krok-legal-body ul{margin:6px 0;padding-left:22px}.krok-legal-body li{margin:3px 0}.krok-legal-body p{margin:6px 0}`}</style>
    </div>
  );
}
