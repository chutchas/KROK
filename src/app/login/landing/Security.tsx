"use client";
import { Clock, KeyRound, ScrollText, ShieldCheck, SquareCheckBig, UserCheck } from "lucide-react";
import Icon from "@/components/Icon";
import type { IconType } from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import Reveal from "./Reveal";

const ITEMS: { icon: IconType; t: MessageKey; d: MessageKey }[] = [
  { icon: ShieldCheck, t: "lp.sec.1t", d: "lp.sec.1d" },
  { icon: UserCheck, t: "lp.sec.2t", d: "lp.sec.2d" },
  { icon: ScrollText, t: "lp.sec.3t", d: "lp.sec.3d" },
  { icon: KeyRound, t: "lp.sec.4t", d: "lp.sec.4d" },
  { icon: SquareCheckBig, t: "lp.sec.5t", d: "lp.sec.5d" },
  { icon: Clock, t: "lp.sec.6t", d: "lp.sec.6d" },
];

export default function Security() {
  const { t } = useT();
  return (
    <section className="lp-sec" id="security">
      <div className="lp-wrap">
        <Reveal className="lp-band">
          <div style={{ maxWidth: 620, marginBottom: 26 }}>
            <span className="lp-eyebrow">{t("lp.sec.eyebrow")}</span>
            <h2 className="lp-h2">
              {t("lp.sec.t1")} <span style={{ color: "#6ee7b7" }}>{t("lp.sec.t2")}</span>
            </h2>
            <p className="lp-lead" style={{ marginTop: 14 }}>{t("lp.sec.sub")}</p>
          </div>
          <div className="lp-grid-3" style={{ gap: "6px 28px" }}>
            {ITEMS.map((s) => (
              <div className="lp-sitem" key={s.t}>
                <span className="lp-tile"><Icon icon={s.icon} className="h-[18px] w-[18px]" /></span>
                <div>
                  <b>{t(s.t)}</b>
                  <p>{t(s.d)}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
