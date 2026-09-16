"use client";
import { ArrowRight, CameraIcon, Check, CircleCheckBig, LineChart, LogIn, PlayCircle, QrCode } from "lucide-react";
import Icon from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import Reveal from "./Reveal";

const TRUST: MessageKey[] = ["lp.trust1", "lp.trust2", "lp.trust3", "lp.trust4"];
const SPARK = [40, 62, 48, 78, 66, 94, 72];

export default function Hero({ onLogin }: { onLogin: () => void }) {
  const { t } = useT();

  return (
    <section className="lp-hero">
      <div className="lp-hero-bg" aria-hidden>
        <div className="lp-hero-grid" />
        <div className="lp-blob lp-blob-a" />
        <div className="lp-blob lp-blob-b" />
        <div className="lp-blob lp-blob-c" />
      </div>

      <div className="lp-wrap lp-hero-layout">
        <div>
          <Reveal>
            <span className="lp-hero-badge">
              <span className="lp-dot" />
              {t("lp.hero.badgeA")} · {t("lp.hero.badgeB")}
            </span>
          </Reveal>

          <Reveal delay={60}>
            <h1 className="lp-h1">
              {t("lp.hero.title1")}
              <br />
              {t("lp.hero.title2")} <span className="lp-grad">{t("lp.hero.title3")}</span>
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="lp-lead">{t("lp.hero.sub")}</p>
          </Reveal>

          <Reveal delay={180}>
            <div className="lp-hero-cta">
              <button type="button" onClick={onLogin} className="lp-btn lp-btn-primary">
                <Icon icon={ArrowRight} className="h-[18px] w-[18px]" /> {t("lp.hero.ctaStart")}
              </button>
              <a href="#how" className="lp-btn lp-btn-ghost">
                <Icon icon={PlayCircle} className="h-[18px] w-[18px]" /> {t("lp.hero.ctaHow")}
              </a>
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

        <Reveal delay={200} className="lp-scene">
          <HeroScene />
        </Reveal>
      </div>
    </section>
  );
}

function HeroScene() {
  const { t } = useT();
  return (
    <>
      <div className="lp-paper" aria-hidden>
        <div className="lp-mono" style={{ marginBottom: 10 }}>PAPER · FRM-014</div>
        {[80, 60, 92, 45, 74, 88, 52].map((w, i) => (
          <i key={i} style={{ width: `${w}%` }} />
        ))}
      </div>

      <div className="lp-phone lp-float">
        <div className="lp-screen">
          <div className="lp-screen-bar">
            <span className="lp-mono" style={{ fontSize: ".64rem" }}>FRM-014</span>
            <span style={{ flex: 1 }} />
            <span className="lp-chip lp-chip-brand lp-chip-xs">{t("lp.scene.step")}</span>
          </div>
          <div className="lp-screen-body">
            <div className="lp-steps">
              {Array.from({ length: 7 }).map((_, i) => (
                <i key={i} className={i < 3 ? "is-on" : undefined} />
              ))}
            </div>
            <div className="lp-q">{t("lp.scene.q")}</div>
            <div className="lp-pf">
              <span className="lp-yes">{t("lp.scene.pass")}</span>
              <span className="lp-no">{t("lp.scene.fail")}</span>
            </div>
            <div className="lp-shot">
              <Icon icon={CameraIcon} className="h-[15px] w-[15px]" /> {t("lp.scene.photo")}
            </div>
            <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
              <span className="lp-mono">07:42</span>
              <span style={{ flex: 1 }} />
              <span className="lp-chip lp-chip-pass lp-chip-xs">{t("lp.scene.offline")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="lp-fcard lp-fcard-1">
        <div className="lp-fcard-t">
          <Icon icon={QrCode} className="h-[15px] w-[15px]" /> {t("lp.scene.scan")}
        </div>
        <div className="lp-mono">krok.app/f/9x2k</div>
      </div>

      <div className="lp-fcard lp-fcard-2">
        <div className="lp-fcard-t">
          <Icon icon={LineChart} className="h-[15px] w-[15px]" /> {t("lp.scene.today")}
        </div>
        <div className="lp-spark" aria-hidden>
          {SPARK.map((h, i) => (
            <i key={i} style={{ height: `${h}%`, animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: ".72rem", alignItems: "baseline" }}>
          <b className="tabnum">128</b>
          <span style={{ color: "var(--ink-2)" }}>{t("lp.scene.subs")}</span>
          <b className="tabnum" style={{ color: "var(--fail)" }}>3</b>
          <span style={{ color: "var(--ink-2)" }}>{t("lp.scene.failed")}</span>
        </div>
      </div>

      <div className="lp-fcard lp-fcard-3">
        <div className="lp-fcard-t">
          <Icon icon={CircleCheckBig} className="h-[15px] w-[15px]" /> {t("lp.scene.appr")}
        </div>
        <div className="lp-trail">
          <div><i style={{ background: "var(--pass)" }} />{t("lp.scene.appr1")}</div>
          <div><i style={{ background: "var(--lp-warn)" }} />{t("lp.scene.appr2")}</div>
          <div><i style={{ background: "var(--surface-4)" }} />{t("lp.scene.appr3")}</div>
        </div>
      </div>
    </>
  );
}

