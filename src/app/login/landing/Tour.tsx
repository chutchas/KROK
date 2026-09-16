"use client";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight, Camera, Check, CircleCheckBig, Clock, FileText, Minus, PenTool,
  ScanBarcode, Sparkles, UserRound,
} from "lucide-react";
import Icon from "@/components/Icon";
import type { IconType } from "@/components/Icon";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import Reveal, { useInView } from "./Reveal";

function prefersReduced() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/* ---------- โครงร่วมของแต่ละตอน ---------- */
function TourBlock({
  eyebrow, heading, body, bullets, cta, stage, flip,
}: {
  eyebrow: ReactNode;
  heading: MessageKey;
  body: MessageKey;
  bullets: MessageKey[];
  cta: MessageKey;
  stage: ReactNode;
  flip?: boolean;
}) {
  const { t } = useT();
  return (
    <div className={`lp-tour${flip ? " is-flip" : ""}`}>
      <div className="lp-tour-copy">
        <Reveal><span className="lp-eyebrow">{eyebrow}</span></Reveal>
        <Reveal delay={60}><h3 className="lp-h3">{t(heading)}</h3></Reveal>
        <Reveal delay={110}><p className="lp-lead">{t(body)}</p></Reveal>
        <Reveal delay={160}>
          <div className="lp-ticks">
            {bullets.map((b) => (
              <div key={b}>
                <Icon icon={Check} className="h-[18px] w-[18px]" strokeWidth={2.4} />
                <span>{t(b)}</span>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={210}>
          <a href="#cta" className="lp-link">
            {t(cta)} <Icon icon={ArrowRight} className="h-[15px] w-[15px]" strokeWidth={2.4} />
          </a>
        </Reveal>
      </div>
      <Reveal delay={120} className="lp-stage">{stage}</Reveal>
    </div>
  );
}

/* ---------- 01 · AI Form Studio ---------- */
const GEN: { icon: IconType; label: MessageKey; tag: MessageKey }[] = [
  { icon: CircleCheckBig, label: "lp.t1.f1", tag: "lp.t1.g1" },
  { icon: Camera, label: "lp.t1.f2", tag: "lp.t1.g2" },
  { icon: ScanBarcode, label: "lp.t1.f3", tag: "lp.t1.g3" },
  { icon: PenTool, label: "lp.t1.f4", tag: "lp.t1.g4" },
  { icon: Clock, label: "lp.t1.f5", tag: "lp.t1.g5" },
];

function StudioStage() {
  const { t } = useT();
  const prompt = t("lp.t1.prompt");
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // พิมพ์ prompt ทีละตัวอักษร แล้วค่อยไล่โชว์ฟิลด์ที่ AI ร่างให้
  useEffect(() => {
    if (!inView) return;
    if (prefersReduced()) {
      setTyped(prompt);
      setDone(true);
      return;
    }
    setTyped("");
    setDone(false);
    let i = 0;
    const step = () => {
      i += 1;
      setTyped(prompt.slice(0, i));
      if (i < prompt.length) timer.current = setTimeout(step, 32);
      else setDone(true);
    };
    timer.current = setTimeout(step, 240);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [inView, prompt]);

  return (
    <div className="lp-ui" ref={ref}>
      <div className="lp-ui-head">
        <span className="lp-ui-dots"><i /><i /><i /></span>
        <span className="lp-mono">studio / new form</span>
      </div>
      <div className="lp-ui-body">
        <div className="lp-prompt">
          <span className="lp-sq"><Icon icon={Sparkles} className="h-[14px] w-[14px]" /></span>
          <div className="lp-typed">
            {typed}
            {!done && <span className="lp-caret" />}
          </div>
        </div>
        <div className="lp-mono" style={{ marginBottom: 6 }}>{t("lp.t1.genLabel")}</div>
        {GEN.map((g, i) => (
          <div key={g.label} className={`lp-gen${done ? " is-on" : ""}`} style={{ transitionDelay: `${i * 130}ms` }}>
            <span className="lp-sq"><Icon icon={g.icon} className="h-[14px] w-[14px]" /></span>
            <span className="lp-gen-l">{t(g.label)}</span>
            <span className="lp-gen-t">{t(g.tag)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 02 · หน้างาน ---------- */
function FloorStage() {
  const { t } = useT();
  const rows: ("pass" | "fail")[] = ["pass", "fail", "pass"];
  return (
    <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "1fr auto", gap: 18, alignItems: "center" }}>
      <div className="lp-ui">
        <div className="lp-ui-head">
          <span className="lp-mono">A4 · paper mode</span>
          <span style={{ flex: 1 }} />
          <span className="lp-chip lp-chip-brand lp-chip-xs">{t("lp.t2.print")}</span>
        </div>
        <div className="lp-ui-body" style={{ display: "grid", gap: 9 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="lp-bar" style={{ width: "38%" }} />
            <span className="lp-bar" style={{ width: "22%", background: "var(--accent-soft)" }} />
          </div>
          {rows.map((r, i) => (
            <div className="lp-row" key={i} style={{ padding: "7px 0" }}>
              <span className="lp-sq"><Icon icon={Minus} className="h-[14px] w-[14px]" /></span>
              <span className="lp-bar" style={{ flex: 1 }} />
              <span className={`lp-chip lp-chip-xs ${r === "pass" ? "lp-chip-pass" : "lp-chip-fail"}`}>
                {r === "pass" ? "PASS" : "FAIL"}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 6 }}>
            <div style={{ flex: 1 }}>
              <div className="lp-mono" style={{ marginBottom: 5 }}>{t("lp.t2.sign")}</div>
              <svg viewBox="0 0 120 30" style={{ width: "100%", height: 30 }} aria-hidden>
                <path d="M4 22C14 6 22 26 32 14s16 10 26 0 18 8 28-4 22 6 30 0" fill="none" stroke="var(--brand-ink)" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="lp-mono">16 SEP 07:48</span>
          </div>
        </div>
      </div>

      <div className="lp-phone" style={{ width: 150, padding: 6, borderRadius: 24 }}>
        <div className="lp-screen" style={{ borderRadius: 19 }}>
          <div className="lp-screen-bar" style={{ padding: "16px 10px 8px" }}>
            <span className="lp-mono" style={{ fontSize: ".6rem" }}>{t("lp.t2.mobile")}</span>
            <span style={{ flex: 1 }} />
            <span className="lp-chip lp-chip-warn lp-chip-xs" style={{ fontSize: ".6rem", padding: "2px 7px" }}>{t("lp.t2.offline")}</span>
          </div>
          <div className="lp-screen-body" style={{ padding: 10, gap: 8 }}>
            <div className="lp-steps">
              {Array.from({ length: 5 }).map((_, i) => (
                <i key={i} className={i < 2 ? "is-on" : undefined} />
              ))}
            </div>
            <div className="lp-q" style={{ fontSize: ".7rem" }}>{t("lp.t2.q")}</div>
            <div className="lp-shot" style={{ height: 60 }}>
              <Icon icon={Camera} className="h-4 w-4" />
            </div>
            <span className="lp-bar" style={{ width: "70%" }} />
            <span className="lp-bar" style={{ width: "45%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- 03 · อนุมัติ ---------- */
const APPR: { state: string; icon: IconType; t: MessageKey; d: MessageKey }[] = [
  { state: "is-done", icon: Check, t: "lp.t3.a1t", d: "lp.t3.a1d" },
  { state: "is-done", icon: Check, t: "lp.t3.a2t", d: "lp.t3.a2d" },
  { state: "is-now", icon: Clock, t: "lp.t3.a3t", d: "lp.t3.a3d" },
  { state: "", icon: UserRound, t: "lp.t3.a4t", d: "lp.t3.a4d" },
];

function ApprovalStage() {
  const { t } = useT();
  return (
    <div className="lp-ui">
      <div className="lp-ui-head">
        <span className="lp-mono">approvals / SUB-2481</span>
        <span style={{ flex: 1 }} />
        <span className="lp-chip lp-chip-warn lp-chip-xs">{t("lp.t3.waiting")}</span>
      </div>
      <div className="lp-ui-body">
        <div style={{ display: "flex", alignItems: "center", gap: 11, paddingBottom: 14, borderBottom: "1px solid var(--lp-hair)", marginBottom: 6 }}>
          <span className="lp-tile lp-tile-grad" style={{ width: 36, height: 36 }}>
            <Icon icon={FileText} className="h-[18px] w-[18px]" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontFamily: "var(--font-anuphan)", fontSize: ".94rem", display: "block" }}>{t("lp.t3.form")}</b>
            <span className="lp-mono">FL-07 · {t("lp.t3.meta")}</span>
          </div>
          <span className="lp-chip lp-chip-fail lp-chip-xs">1 FAIL</span>
        </div>
        {APPR.map((a) => (
          <div key={a.t} className={`lp-appr-step ${a.state}`}>
            <span className="lp-ic"><Icon icon={a.icon} className="h-[15px] w-[15px]" strokeWidth={2.4} /></span>
            <div>
              <b>{t(a.t)}</b>
              <span className="lp-mono">{t(a.d)}</span>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
          <span className="lp-btn lp-btn-primary lp-btn-sm" style={{ pointerEvents: "none" }}>{t("lp.t3.approve")}</span>
          <span className="lp-btn lp-btn-ghost lp-btn-sm" style={{ pointerEvents: "none" }}>{t("lp.t3.reject")}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- 04 · แดชบอร์ด ---------- */
const BARS = [42, 58, 35, 74, 66, 88, 52, 97, 61, 79];

function Counter({ to, suffix = "", run }: { to: number; suffix?: string; run: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (prefersReduced()) {
      setN(to);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / 1100, 1);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, to]);
  return <b className="tabnum">{n}{suffix}</b>;
}

function DashboardStage() {
  const { t } = useT();
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const rows: { k: MessageKey; s: "pass" | "fail" | "warn" }[] = [
    { k: "lp.t4.r1", s: "fail" },
    { k: "lp.t4.r2", s: "pass" },
    { k: "lp.t4.r3", s: "warn" },
  ];
  return (
    <div className="lp-ui" ref={ref}>
      <div className="lp-ui-head">
        <span className="lp-mono">dashboard / {t("lp.t4.today")}</span>
        <span style={{ flex: 1 }} />
        <span className="lp-chip lp-chip-pass lp-chip-xs">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
          {t("lp.t4.live")}
        </span>
      </div>
      <div className="lp-ui-body">
        <div className="lp-kpis">
          <div className="lp-kpi"><Counter to={128} run={inView} /><span>{t("lp.t4.k1")}</span></div>
          <div className="lp-kpi"><Counter to={96} suffix="%" run={inView} /><span>{t("lp.t4.k2")}</span></div>
          <div className="lp-kpi" style={{ color: "var(--fail)" }}><Counter to={3} run={inView} /><span style={{ color: "var(--ink-3)" }}>{t("lp.t4.k3")}</span></div>
        </div>
        <div className="lp-mono" style={{ marginBottom: 2 }}>{t("lp.t4.chartLabel")}</div>
        <div className={`lp-chart${inView ? " is-in" : ""}`} aria-hidden>
          {BARS.map((h, i) => (
            <i key={i} style={{ height: `${h}%`, transitionDelay: `${i * 55}ms` }} />
          ))}
        </div>
        <div style={{ marginTop: 12, borderTop: "1px solid var(--lp-hair)" }}>
          {rows.map((r) => (
            <div className="lp-row" key={r.k}>
              <span className="lp-sq"><Icon icon={FileText} className="h-[14px] w-[14px]" /></span>
              <span style={{ flex: 1, fontSize: ".83rem" }}>{t(r.k)}</span>
              <span className={`lp-chip lp-chip-xs lp-chip-${r.s}`}>
                {r.s === "pass" ? "PASS" : r.s === "fail" ? "FAIL" : t("lp.t4.late")}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 7, marginTop: 13 }}>
          <span className="lp-chip" style={{ fontSize: ".7rem" }}>PDF</span>
          <span className="lp-chip" style={{ fontSize: ".7rem" }}>Excel</span>
          <span className="lp-chip" style={{ fontSize: ".7rem" }}>CSV</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- section ---------- */
export default function Tour() {
  const { t } = useT();
  return (
    <section className="lp-sec" id="product">
      <div className="lp-wrap">
        <div className="lp-center lp-head">
          <Reveal><span className="lp-eyebrow">{t("lp.tour.eyebrow")}</span></Reveal>
          <Reveal delay={60}>
            <h2 className="lp-h2">{t("lp.tour.t1")} <span className="lp-grad">{t("lp.tour.t2")}</span></h2>
          </Reveal>
          <Reveal delay={120}><p className="lp-lead" style={{ marginTop: 14 }}>{t("lp.tour.sub")}</p></Reveal>
        </div>

        <TourBlock
          eyebrow={t("lp.t1.eyebrow")}
          heading="lp.t1.h" body="lp.t1.p" cta="lp.t1.cta"
          bullets={["lp.t1.b1", "lp.t1.b2", "lp.t1.b3"]}
          stage={<StudioStage />}
        />
        <TourBlock
          flip
          eyebrow={<>02 · {t("lp.t2.eyebrow")}</>}
          heading="lp.t2.h" body="lp.t2.p" cta="lp.t2.cta"
          bullets={["lp.t2.b1", "lp.t2.b2", "lp.t2.b3"]}
          stage={<FloorStage />}
        />
        <TourBlock
          eyebrow={<>03 · {t("lp.t3.eyebrow")}</>}
          heading="lp.t3.h" body="lp.t3.p" cta="lp.t3.cta"
          bullets={["lp.t3.b1", "lp.t3.b2", "lp.t3.b3"]}
          stage={<ApprovalStage />}
        />
        <TourBlock
          flip
          eyebrow={<>04 · {t("lp.t4.eyebrow")}</>}
          heading="lp.t4.h" body="lp.t4.p" cta="lp.t4.cta"
          bullets={["lp.t4.b1", "lp.t4.b2", "lp.t4.b3"]}
          stage={<DashboardStage />}
        />
      </div>
    </section>
  );
}
