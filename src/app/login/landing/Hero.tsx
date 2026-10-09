"use client";
import { ArrowRight, Check, MoreHorizontal, X } from "lucide-react";
import Icon from "@/components/Icon";
import { useLp as useT } from "@/i18n/landing";
import type { AnyKey as MessageKey } from "@/i18n/landing";
import Reveal from "./Reveal";

const TRUST: MessageKey[] = ["lp.trust1", "lp.trust2", "lp.trust3"];
// ผลบนกระดาษ: true = ผ่าน, false = ไม่ผ่าน
const PAPER_ITEMS: [MessageKey, boolean][] = [
  ["lp.scene.i1", true],
  ["lp.scene.i2", true],
  ["lp.scene.i3", false],
  ["lp.scene.i4", true],
  ["lp.scene.i5", true],
];

export default function Hero({ onLogin }: { onLogin: () => void }) {
  const { t } = useT();
  return (
    <section className="lp-hero">
      <div className="lp-wrap lp-hero-layout">
        <div>
          <Reveal>
            <span className="lp-hero-badge">
              <span className="lp-dot" />
              {t("lp.hero.eyebrow")}
            </span>
          </Reveal>
          <Reveal delay={60}>
            <h1 className="lp-h1">
              {t("lp.hero.title1")}
              <br />
              {t("lp.hero.title2")}<span className="lp-mark">{t("lp.hero.title3")}</span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="lp-lead">{t("lp.hero.sub")}</p>
          </Reveal>
          <Reveal delay={180}>
            <div className="lp-hero-cta">
              <button type="button" onClick={onLogin} className="lp-btn lp-btn-primary">
                {t("lp.hero.ctaStart")} <Icon icon={ArrowRight} className="h-[18px] w-[18px]" />
              </button>
              <a href="#how" className="lp-btn lp-btn-ghost">{t("lp.hero.ctaHow")}</a>
            </div>
          </Reveal>
          <Reveal delay={240}>
            <div className="lp-trust">
              {TRUST.map((k) => (
                <span key={k}>
                  <Icon icon={Check} className="h-[15px] w-[15px]" strokeWidth={2.4} /> {t(k)}
                </span>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={160} className="lp-scene">
          <HeroScene />
        </Reveal>
      </div>
    </section>
  );
}

/** กระดาษใบเดิม (ข้างหลัง) → มือถือโหมดกรอกเต็มจอ (ข้างหน้า) — ภาพประกอบ ไม่ใช่ UI ที่กดได้ */
function HeroScene() {
  const { t } = useT();
  return (
    <div className="lp-scene-in" aria-hidden>
      <div className="lp-sheet">
        <div className="lp-sheet-head">
          <div>
            <b>{t("lp.scene.title")}</b>
            <small>{t("lp.scene.titleSub")}</small>
          </div>
          <span className="lp-doc-code">FRM-014<br />Rev.03</span>
        </div>
        <div className="lp-sheet-meta">
          <span>{t("lp.scene.date")} <em className="lp-doc-code">08/10/69</em></span>
          <span>{t("lp.scene.shift")} <em>{t("lp.scene.shiftV")}</em></span>
          <span>{t("lp.scene.unit")} <em className="lp-doc-code">FL-07</em></span>
          <span>{t("lp.scene.by")} <em>{t("lp.scene.byV")}</em></span>
        </div>
        <div className="lp-sheet-rows">
          {PAPER_ITEMS.map(([k, ok], i) => (
            <div key={k}>
              <span>{i + 1}. {t(k)}</span>
              <span className="lp-doc-code">{ok ? "☑ ☐" : "☐ ☑"}</span>
            </div>
          ))}
        </div>
        <div className="lp-sheet-note">{t("lp.scene.note")} <em>{t("lp.scene.noteV")}</em></div>
        <div className="lp-sheet-sign">
          <span>{t("lp.scene.by")} ____________</span>
          <span>{t("lp.scene.sup")} ____________</span>
        </div>
        <span className="lp-stamp lp-stamp-fail">{t("lp.scene.stamp")}</span>
      </div>

      <div className="lp-phone">
        <div className="lp-screen">
          <div className="lp-screen-bar">
            <div style={{ flex: 1, minWidth: 0 }}>
              <b className="lp-ellipsis">{t("lp.scene.title")}</b>
              <small>{t("lp.scene.step")}</small>
            </div>
            <Icon icon={MoreHorizontal} className="h-[18px] w-[18px]" />
            <Icon icon={X} className="h-[18px] w-[18px]" />
          </div>
          <div className="lp-steps"><i className="is-done" /><i className="is-on" /><i /></div>
          <div className="lp-screen-body">
            <div className="lp-q-title">{t("lp.scene.section")}</div>
            <div className="lp-q">
              <div>{t("lp.scene.i1")}</div>
              <div className="lp-pf"><span className="lp-yes">✓ {t("lp.scene.pass")}</span><span>✕ {t("lp.scene.fail")}</span></div>
            </div>
            <div className="lp-q">
              <div>{t("lp.scene.i3")}</div>
              <div className="lp-pf"><span>✓ {t("lp.scene.pass")}</span><span className="lp-no">✕ {t("lp.scene.fail")}</span></div>
              <div className="lp-shot">{t("lp.scene.photo")}</div>
            </div>
            <div className="lp-q">
              <div>{t("lp.scene.hours")}</div>
              <div className="lp-input lp-doc-code">4,218</div>
            </div>
          </div>
          <div className="lp-screen-foot">
            <span>← {t("lp.scene.prev")}</span>
            <span className="is-main">{t("lp.scene.next")}</span>
          </div>
        </div>
      </div>

      <div className="lp-offline">
        <span className="lp-offline-dot" />
        <span><b>{t("lp.scene.offB")}</b> · {t("lp.scene.offT")}</span>
      </div>
    </div>
  );
}
