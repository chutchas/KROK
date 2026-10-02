import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { LEGAL_EFFECTIVE_TH, LEGAL_VERSION } from "@/lib/legal";

// โครงหน้าเอกสารกฎหมาย (server component) — อ่านง่ายบนมือถือ พิมพ์ได้
export type LegalSection = { id: string; title: string; body: React.ReactNode };

export default function LegalDoc({ title, intro, sections, other }: {
  title: string;
  intro: React.ReactNode;
  sections: LegalSection[];
  other: { href: string; label: string };
}) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
      <header style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)", padding: "12px 16px" }} className="no-print">
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
            <LogoMark size={26} variant="compact" title="KROK" />
            <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.1rem" }}>KROK</b>
          </Link>
          <Link href={other.href} style={{ marginLeft: "auto", fontSize: ".86rem" }}>{other.label}</Link>
        </div>
      </header>
      <main style={{ maxWidth: 820, margin: "0 auto", padding: "28px 18px 80px", lineHeight: 1.75, fontSize: ".95rem" }}>
        <h1 style={{ fontSize: "1.6rem", margin: "0 0 4px" }}>{title}</h1>
        <div style={{ color: "var(--ink-3)", fontSize: ".82rem", marginBottom: 18 }}>
          มีผลตั้งแต่ {LEGAL_EFFECTIVE_TH} · ฉบับ {LEGAL_VERSION}
        </div>
        <div style={{ color: "var(--ink-2)" }}>{intro}</div>

        <nav aria-label="สารบัญ" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 16px", margin: "18px 0 8px" }}>
          <b style={{ fontSize: ".86rem" }}>สารบัญ</b>
          <ol style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: ".88rem" }}>
            {sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
          </ol>
        </nav>

        {sections.map((s, i) => (
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
