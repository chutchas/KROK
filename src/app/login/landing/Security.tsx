"use client";
import { useLp as useT } from "@/i18n/landing";
import type { AnyKey as MessageKey } from "@/i18n/landing";
import Reveal from "./Reveal";

const ITEMS: { t: MessageKey; d: MessageKey }[] = [
  { t: "lp.sec.1t", d: "lp.sec.1d" },
  { t: "lp.sec.2t", d: "lp.sec.2d" },
  { t: "lp.sec.3t", d: "lp.sec.3d" },
  { t: "lp.sec.4t", d: "lp.sec.4d" },
  { t: "lp.sec.5t", d: "lp.sec.5d" },
  { t: "lp.sec.6t", d: "lp.sec.6d" },
];

export default function Security() {
  const { t } = useT();
  return (
    <section className="lp-band" id="security">
      <div className="lp-wrap">
        <Reveal><span className="lp-eyebrow">{t("lp.sec.eyebrow")}</span></Reveal>
        <Reveal delay={60}><h2 className="lp-h2" style={{ maxWidth: 720 }}>{t("lp.sec.t")}</h2></Reveal>
        <div className="lp-band-grid">
          {ITEMS.map((s, i) => (
            <Reveal key={s.t} delay={(i % 3) * 60}>
              <b>{t(s.t)}</b>
              <p>{t(s.d)}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
