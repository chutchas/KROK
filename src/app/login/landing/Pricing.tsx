"use client";
import { Check } from "lucide-react";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import Reveal from "./Reveal";

type Tier = {
  name: MessageKey; sub: MessageKey; amount: MessageKey; per: MessageKey;
  features: MessageKey; cta: MessageKey; highlight?: boolean;
};

const TIERS: Tier[] = [
  { name: "lp.pr.1n", sub: "lp.pr.1s", amount: "lp.pr.1a", per: "lp.pr.1p", features: "lp.pr.1f", cta: "lp.pr.1c" },
  { name: "lp.pr.2n", sub: "lp.pr.2s", amount: "lp.pr.2a", per: "lp.pr.2p", features: "lp.pr.2f", cta: "lp.pr.2c", highlight: true },
  { name: "lp.pr.3n", sub: "lp.pr.3s", amount: "lp.pr.3a", per: "lp.pr.3p", features: "lp.pr.3f", cta: "lp.pr.3c" },
  { name: "lp.pr.4n", sub: "lp.pr.4s", amount: "lp.pr.4a", per: "lp.pr.4p", features: "lp.pr.4f", cta: "lp.pr.4c" },
];

export default function Pricing({ onLogin }: { onLogin: () => void }) {
  const { t } = useT();
  return (
    <section className="lp-sec" id="pricing" style={{ background: "var(--surface-2)" }}>
      <div className="lp-wrap">
        <div className="lp-center lp-head-sm">
          <Reveal><span className="lp-eyebrow">{t("lp.pr.eyebrow")}</span></Reveal>
          <Reveal delay={60}>
            <h2 className="lp-h2">{t("lp.pr.t1")} <span className="lp-grad">{t("lp.pr.t2")}</span></h2>
          </Reveal>
          <Reveal delay={120}><p className="lp-lead" style={{ marginTop: 14 }}>{t("lp.pr.sub")}</p></Reveal>
        </div>
        <div className="lp-grid-4">
          {TIERS.map((tier, i) => (
            <Reveal key={tier.name} delay={i * 60} className={`lp-price${tier.highlight ? " is-hi" : ""}`}>
              {tier.highlight && <span className="lp-price-tag">{t("lp.pr.popular")}</span>}
              <h4>{t(tier.name)}</h4>
              <div className="lp-price-sub">{t(tier.sub)}</div>
              <div className="lp-price-amt tabnum">{t(tier.amount)}</div>
              <div className="lp-price-per">{t(tier.per)}</div>
              <ul>
                {t(tier.features).split(",").map((f) => (
                  <li key={f}>
                    <Icon icon={Check} className="h-[15px] w-[15px]" strokeWidth={2.4} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onLogin}
                className={`lp-btn lp-btn-sm ${tier.highlight ? "lp-btn-primary" : "lp-btn-ghost"}`}
              >
                {t(tier.cta)}
              </button>
            </Reveal>
          ))}
        </div>
        <Reveal delay={120}><p className="lp-note">⚠ {t("lp.pr.note")}</p></Reveal>
      </div>
    </section>
  );
}
