"use client";
import { ArrowRight, Check } from "lucide-react";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import Reveal from "./Reveal";

const QA: { q: MessageKey; a: MessageKey }[] = [
  { q: "lp.faq.q1", a: "lp.faq.a1" },
  { q: "lp.faq.q2", a: "lp.faq.a2" },
  { q: "lp.faq.q3", a: "lp.faq.a3" },
  { q: "lp.faq.q4", a: "lp.faq.a4" },
  { q: "lp.faq.q5", a: "lp.faq.a5" },
  { q: "lp.faq.q6", a: "lp.faq.a6" },
];

export function Faq() {
  const { t } = useT();
  return (
    <section className="lp-sec" style={{ paddingBottom: "clamp(40px, 5vw, 72px)" }}>
      <div className="lp-wrap">
        <div className="lp-center" style={{ maxWidth: 620, margin: "0 auto 40px" }}>
          <Reveal><span className="lp-eyebrow">{t("lp.faq.eyebrow")}</span></Reveal>
          <Reveal delay={60}><h2 className="lp-h2">{t("lp.faq.t")}</h2></Reveal>
        </div>
        <div className="lp-faq">
          {QA.map((item, i) => (
            <Reveal key={item.q} delay={Math.min(i, 4) * 50}>
              <details className="lp-fq">
                <summary>{t(item.q)}</summary>
                <div className="lp-fq-a">{t(item.a)}</div>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ onLogin }: { onLogin: () => void }) {
  const { t } = useT();
  return (
    <section className="lp-sec" id="cta" style={{ paddingTop: "clamp(28px, 3.5vw, 52px)" }}>
      <div className="lp-wrap">
        <Reveal className="lp-cta-box">
          <span className="lp-eyebrow">{t("lp.cta.eyebrow")}</span>
          <h2 className="lp-h2" style={{ maxWidth: 560, margin: "0 auto 16px" }}>
            {t("lp.cta.t1")} <span className="lp-grad">{t("lp.cta.t2")}</span>
          </h2>
          <p className="lp-lead" style={{ maxWidth: 520, margin: "0 auto 30px" }}>{t("lp.cta.p")}</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={onLogin} className="lp-btn lp-btn-primary">
              <Icon icon={ArrowRight} className="h-[18px] w-[18px]" /> {t("lp.cta.b1")}
            </button>
            <button type="button" onClick={onLogin} className="lp-btn lp-btn-ghost">{t("lp.cta.b2")}</button>
          </div>
          <div className="lp-trust" style={{ justifyContent: "center", marginTop: 26 }}>
            <span><Icon icon={Check} className="h-[15px] w-[15px]" strokeWidth={2.4} /> {t("lp.cta.n1")}</span>
            <span><Icon icon={Check} className="h-[15px] w-[15px]" strokeWidth={2.4} /> {t("lp.cta.n2")}</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
