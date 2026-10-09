"use client";
import { Check } from "lucide-react";
import Icon from "@/components/Icon";
import { useLp as useT } from "@/i18n/landing";
import type { AnyKey as MessageKey } from "@/i18n/landing";
import Reveal from "./Reveal";

const PAIN: MessageKey[] = ["lp.pain.1", "lp.pain.2", "lp.pain.3"];

/** แถบปัญหาเดิม 01–03 ใต้ hero */
export function Pain() {
  const { t } = useT();
  return (
    <section className="lp-pain" aria-label={t("lp.pain.label")}>
      <div className="lp-wrap lp-pain-in">
        {PAIN.map((k, i) => (
          <div key={k}>
            <span className="lp-num">0{i + 1}</span>
            <span>{t(k)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** กระดาษ → มือถือ → A4 */
export function How() {
  const { t, tt } = useT();
  const steps: { t: MessageKey; d: MessageKey; art: React.ReactNode }[] = [
    { t: "lp.how.s1t", d: "lp.how.s1d", art: <ArtPaper /> },
    { t: "lp.how.s2t", d: "lp.how.s2d", art: <ArtPhone /> },
    { t: "lp.how.s3t", d: "lp.how.s3d", art: <ArtA4 /> },
  ];
  return (
    <section className="lp-sec" id="how">
      <div className="lp-wrap">
        <Reveal><span className="lp-eyebrow">{t("lp.how.eyebrow")}</span></Reveal>
        <Reveal delay={60}><h2 className="lp-h2" style={{ maxWidth: 780 }}>{t("lp.how.t")}</h2></Reveal>
        <div className="lp-grid-3 lp-how">
          {steps.map((s, i) => (
            <Reveal key={s.t} delay={i * 70} className="lp-card lp-how-card">
              <div className="lp-art" aria-hidden>{s.art}</div>
              <span className="lp-step">{tt("lp.how.step", { n: i + 1 })}</span>
              <h3>{t(s.t)}</h3>
              <p>{t(s.d)}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ArtPaper() {
  const { t } = useT();
  return (
    <>
      <div className="lp-mini-sheet" style={{ transform: "rotate(-3deg)" }}>
        <i className="is-title" /><i /><i /><i /><i style={{ width: "80%" }} />
      </div>
      <span className="lp-art-tag">{t("lp.how.s1tag")}</span>
    </>
  );
}

function ArtPhone() {
  const { t } = useT();
  return (
    <>
      <div className="lp-mini-phone">
        <div>
          <i className="is-bar" />
          <i className="is-field" />
          <span className="is-pf"><i /><i /></span>
          <i className="is-field" />
          <i className="is-btn" />
        </div>
      </div>
      <div className="lp-art-chips">
        {t("lp.how.s2tags").split(",").map((c) => <span key={c}>{c}</span>)}
      </div>
    </>
  );
}

function ArtA4() {
  const { t } = useT();
  return (
    <>
      <div className="lp-mini-sheet is-a4">
        <span className="lp-mini-head"><i className="is-title" style={{ width: "55%" }} /><span className="lp-doc-code">FRM-014</span></span>
        <i className="is-rule" />
        <i /><i /><i />
        <i className="is-photo" />
        <span className="lp-mini-sign"><span>{t("lp.how.s3by")}</span><span>{t("lp.how.s3ok")}</span></span>
      </div>
      <span className="lp-stamp lp-stamp-ok lp-stamp-sm">{t("lp.how.s3stamp")}</span>
    </>
  );
}

/** ตรวจ / อนุมัติ / รายงาน */
export function Jobs() {
  const { t } = useT();
  return (
    <section className="lp-sec lp-sec-flush" id="features">
      <div className="lp-wrap">
        <Reveal><h2 className="lp-h2">{t("lp.jobs.t")}</h2></Reveal>
        <Reveal delay={60} className="lp-jobs">
          <div className="lp-job">
            <h3>{t("lp.jobs.1t")}</h3>
            <p>{t("lp.jobs.1d")}</p>
            <ul className="lp-ticks">
              {t("lp.jobs.1b").split(",").map((b) => (
                <li key={b}><Icon icon={Check} className="h-[15px] w-[15px]" strokeWidth={2.6} />{b}</li>
              ))}
            </ul>
          </div>
          <div className="lp-job">
            <h3>{t("lp.jobs.2t")}</h3>
            <p>{t("lp.jobs.2d")}</p>
            <div className="lp-failbox" aria-hidden>
              <b>{t("lp.jobs.2f")}</b>
              <div><span>{t("lp.scene.i3")}</span><b>{t("lp.scene.fail")}</b></div>
              <em>“{t("lp.scene.noteV")}”</em>
            </div>
          </div>
          <div className="lp-job">
            <h3>{t("lp.jobs.3t")}</h3>
            <p>{t("lp.jobs.3d")}</p>
            <div className="lp-kpis" aria-hidden>
              <div><span>{t("lp.jobs.k1")}</span><b className="tabnum" style={{ color: "var(--fail-text)" }}>3</b></div>
              <div><span>{t("lp.jobs.k2")}</span><b className="tabnum" style={{ color: "var(--warn)" }}>2</b></div>
              <div><span>{t("lp.jobs.k3")}</span><b className="tabnum">7</b></div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
