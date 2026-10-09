"use client";
import { ArrowRight } from "lucide-react";
import Icon from "@/components/Icon";
import { useLp as useT } from "@/i18n/landing";
import type { AnyKey as MessageKey } from "@/i18n/landing";
import Reveal from "./Reveal";

const QA: { q: MessageKey; a: MessageKey }[] = [
  { q: "lp.faq.q1", a: "lp.faq.a1" },
  { q: "lp.faq.q2", a: "lp.faq.a2" },
  { q: "lp.faq.q3", a: "lp.faq.a3" },
  { q: "lp.faq.q4", a: "lp.faq.a4" },
];

export function Faq() {
  const { t } = useT();
  return (
    <section className="lp-sec" id="faq">
      <div className="lp-wrap lp-faq">
        <Reveal><h2 className="lp-h2" style={{ marginBottom: 24 }}>{t("lp.faq.t")}</h2></Reveal>
        {QA.map((item, i) => (
          <Reveal key={item.q} delay={Math.min(i, 3) * 50}>
            <details className="lp-fq" open={i === 0}>
              <summary>{t(item.q)}</summary>
              <div className="lp-fq-a">{t(item.a)}</div>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function FinalCta({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  const { t } = useT();
  return (
    <section className="lp-cta" id="cta">
      <div className="lp-wrap lp-cta-in">
        <div style={{ flex: "1 1 520px", minWidth: 0 }}>
          <h2 className="lp-h2">{t("lp.cta.t")}</h2>
          <p className="lp-lead" style={{ marginTop: 12, maxWidth: 600 }}>{t("lp.cta.p")}</p>
        </div>
        <div className="lp-cta-btns">
          <button type="button" onClick={onSignup} className="lp-btn lp-btn-primary">
            {t("lp.cta.b1")} <Icon icon={ArrowRight} className="h-[18px] w-[18px]" />
          </button>
          <button type="button" onClick={onLogin} className="lp-btn lp-btn-ghost">{t("lp.cta.b2")}</button>
        </div>
      </div>
    </section>
  );
}
