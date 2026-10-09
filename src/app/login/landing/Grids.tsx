"use client";
import { useLp as useT } from "@/i18n/landing";
import type { AnyKey as MessageKey } from "@/i18n/landing";
import Reveal from "./Reveal";

const CASES: { t: MessageKey; d: MessageKey; g: MessageKey }[] = [
  { t: "lp.uc.1t", d: "lp.uc.1d", g: "lp.uc.1g" },
  { t: "lp.uc.2t", d: "lp.uc.2d", g: "lp.uc.2g" },
  { t: "lp.uc.3t", d: "lp.uc.3d", g: "lp.uc.3g" },
  { t: "lp.uc.4t", d: "lp.uc.4d", g: "lp.uc.4g" },
  { t: "lp.uc.5t", d: "lp.uc.5d", g: "lp.uc.5g" },
  { t: "lp.uc.6t", d: "lp.uc.6d", g: "lp.uc.6g" },
];

/** กลุ่มผู้ใช้ — รายการมีเส้นบรรทัดแบบสมุด ไม่ใช่การ์ดไอคอน */
export function UseCases() {
  const { t } = useT();
  return (
    <section className="lp-sec lp-sec-alt" id="usecases">
      <div className="lp-wrap">
        <Reveal><h2 className="lp-h2">{t("lp.uc.t")}</h2></Reveal>
        <Reveal delay={60}><p className="lp-lead" style={{ maxWidth: 640, marginTop: 12 }}>{t("lp.uc.sub")}</p></Reveal>
        <div className="lp-uc-list">
          {CASES.map((c, i) => (
            <Reveal key={c.t} delay={(i % 2) * 60} className="lp-uc">
              <div className="lp-uc-top">
                <h3>{t(c.t)}</h3>
                <span>{t(c.g)}</span>
              </div>
              <p>{t(c.d)}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
