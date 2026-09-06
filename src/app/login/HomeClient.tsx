"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import LoginForm from "./LoginForm";
import {
  Sparkles, FileText, QrCode, CheckCircle2, LayoutDashboard, WifiOff,
  ChevronLeft, ChevronRight, X, LogIn, ArrowRight,
} from "lucide-react";

type Slide = { img: string; alt: string; titleKey: MessageKey; descKey: MessageKey };
const SLIDES: Slide[] = [
  { img: "/shots/create-ai.png", alt: "AI form builder", titleKey: "home.slide1t", descKey: "home.slide1d" },
  { img: "/shots/design-paper.png", alt: "Paper layout editor", titleKey: "home.slide2t", descKey: "home.slide2d" },
  { img: "/shots/fill-paper.png", alt: "Fill on paper", titleKey: "home.slide3t", descKey: "home.slide3d" },
  { img: "/shots/manage-share.png", alt: "Share by QR", titleKey: "home.slide4t", descKey: "home.slide4d" },
  { img: "/shots/fill-list.png", alt: "Manage forms", titleKey: "home.slide5t", descKey: "home.slide5d" },
];

export default function HomeClient() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = SLIDES.length;

  const go = useCallback((d: number) => setI((v) => (v + d + n) % n), [n]);

  // เลื่อนสไลด์อัตโนมัติ (หยุดเมื่อ hover หรือเปิด modal)
  useEffect(() => {
    if (paused || open) return;
    const id = setInterval(() => setI((v) => (v + 1) % n), 5000);
    return () => clearInterval(id);
  }, [paused, open, n]);

  // ปิด modal ด้วย Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const features: { icon: typeof Sparkles; k: MessageKey }[] = [
    { icon: Sparkles, k: "home.f1" },
    { icon: FileText, k: "home.f2" },
    { icon: QrCode, k: "home.f3" },
    { icon: CheckCircle2, k: "home.f4" },
    { icon: LayoutDashboard, k: "home.f5" },
    { icon: WifiOff, k: "home.f6" },
  ];
  const steps: { t: MessageKey; d: MessageKey }[] = [
    { t: "home.step1t", d: "home.step1d" },
    { t: "home.step2t", d: "home.step2d" },
    { t: "home.step3t", d: "home.step3d" },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: "var(--ground)", color: "var(--ink)" }}>
      {/* ===== Top bar ===== */}
      <header className="krok-home-bar" style={{ position: "sticky", top: 0, zIndex: 20, background: "color-mix(in srgb, var(--surface) 88%, transparent)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          <LogoMark size={30} title="KROK" />
          <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.25rem", letterSpacing: ".02em" }}>KROK</b>
          <span style={{ flex: 1 }} />
          <LanguageToggle />
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5"
            style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "var(--accent)", color: "var(--accent-ink)", fontFamily: "inherit", fontWeight: 600, fontSize: ".9rem", cursor: "pointer" }}>
            <Icon icon={LogIn} className="h-4 w-4" /> {t("home.ctaLogin")}
          </button>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(36px, 7vw, 80px) 18px clamp(20px, 4vw, 40px)", textAlign: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: ".8rem", fontWeight: 600, color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid var(--line)", borderRadius: 999, padding: "6px 14px" }}>
          <Icon icon={Sparkles} className="h-4 w-4" /> {t("home.badge")}
        </span>
        <h1 style={{ fontFamily: "var(--font-anuphan)", fontSize: "clamp(1.8rem, 5.5vw, 3.1rem)", lineHeight: 1.15, margin: "18px auto 12px", maxWidth: 760 }}>
          {t("home.heroTitle")}
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: "clamp(.95rem, 2.5vw, 1.12rem)", maxWidth: 640, margin: "0 auto 26px", lineHeight: 1.6 }}>
          {t("home.heroSub")}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5"
            style={{ padding: "13px 26px", borderRadius: 12, border: "none", background: "var(--accent)", color: "var(--accent-ink)", fontFamily: "inherit", fontWeight: 700, fontSize: "1rem", cursor: "pointer" }}>
            <Icon icon={LogIn} className="h-[18px] w-[18px]" /> {t("home.ctaStart")}
          </button>
          <a href="#features" className="inline-flex items-center gap-1.5"
            style={{ padding: "13px 22px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontWeight: 600, fontSize: "1rem", textDecoration: "none" }}>
            {t("home.seeFeatures")} <Icon icon={ArrowRight} className="h-[18px] w-[18px]" />
          </a>
        </div>
      </section>

      {/* ===== Feature slider ===== */}
      <section id="features" style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 18px 8px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-anuphan)", fontSize: "clamp(1.3rem, 4vw, 1.9rem)", margin: "0 0 4px" }}>{t("home.featuresTitle")}</h2>
        <p style={{ color: "var(--ink-2)", margin: "0 0 20px" }}>{t("home.featuresSub")}</p>
      </section>

      <section
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        style={{ maxWidth: 1000, margin: "0 auto", padding: "0 18px" }}
      >
        <div style={{ position: "relative", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 20, boxShadow: "var(--shadow)", overflow: "hidden" }}>
          <div className="krok-slide">
            {/* ข้อความ */}
            <div className="krok-slide-text">
              <span style={{ fontFamily: "monospace", fontSize: ".74rem", color: "var(--ink-3)", border: "1px solid var(--line)", borderRadius: 6, padding: "3px 9px" }}>
                {i + 1} / {n}
              </span>
              <h3 style={{ fontFamily: "var(--font-anuphan)", fontSize: "clamp(1.25rem, 3.5vw, 1.7rem)", margin: "14px 0 10px" }}>{t(SLIDES[i].titleKey)}</h3>
              <p style={{ color: "var(--ink-2)", fontSize: "1rem", lineHeight: 1.65, margin: 0 }}>{t(SLIDES[i].descKey)}</p>
              <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
                {SLIDES.map((_, k) => (
                  <button key={k} aria-label={`slide ${k + 1}`} onClick={() => setI(k)}
                    style={{ width: k === i ? 26 : 9, height: 9, borderRadius: 999, border: "none", cursor: "pointer", background: k === i ? "var(--accent)" : "var(--line)", transition: "all .25s" }} />
                ))}
              </div>
            </div>
            {/* ภาพหน้าจอจริง ในกรอบมือถือ */}
            <div className="krok-slide-shot">
              <div style={{ borderRadius: 26, border: "8px solid var(--ink)", background: "var(--ink)", boxShadow: "0 18px 44px rgba(10,14,18,.28)", overflow: "hidden", width: "min(230px, 62vw)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={SLIDES[i].img} alt={SLIDES[i].alt} style={{ display: "block", width: "100%", height: "auto" }} />
              </div>
            </div>
          </div>

          <button aria-label={t("home.prev")} onClick={() => go(-1)} className="krok-arrow" style={{ left: 10 }}>
            <Icon icon={ChevronLeft} className="h-5 w-5" />
          </button>
          <button aria-label={t("home.next")} onClick={() => go(1)} className="krok-arrow" style={{ right: 10 }}>
            <Icon icon={ChevronRight} className="h-5 w-5" />
          </button>
        </div>
      </section>

      {/* ===== Feature grid ===== */}
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "clamp(30px,6vw,54px) 18px 6px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {features.map((f) => (
            <div key={f.k} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px" }}>
              <span style={{ width: 38, height: 38, flex: "0 0 auto", borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon={f.icon} className="h-5 w-5" />
              </span>
              <b style={{ fontFamily: "var(--font-anuphan)", fontSize: ".98rem" }}>{t(f.k)}</b>
            </div>
          ))}
        </div>
      </section>

      {/* ===== How to use ===== */}
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "clamp(30px,6vw,54px) 18px" }}>
        <h2 style={{ fontFamily: "var(--font-anuphan)", fontSize: "clamp(1.3rem, 4vw, 1.9rem)", textAlign: "center", margin: "0 0 22px" }}>{t("home.howTitle")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {steps.map((s, k) => (
            <div key={k} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 20 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--accent)", color: "var(--accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-anuphan)", fontWeight: 700, marginBottom: 12 }}>{k + 1}</div>
              <b style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.05rem", display: "block", marginBottom: 6 }}>{t(s.t)}</b>
              <p style={{ color: "var(--ink-2)", fontSize: ".92rem", lineHeight: 1.6, margin: 0 }}>{t(s.d)}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 30 }}>
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5"
            style={{ padding: "13px 30px", borderRadius: 12, border: "none", background: "var(--accent)", color: "var(--accent-ink)", fontFamily: "inherit", fontWeight: 700, fontSize: "1rem", cursor: "pointer" }}>
            <Icon icon={LogIn} className="h-[18px] w-[18px]" /> {t("home.ctaStart")}
          </button>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer style={{ borderTop: "1px solid var(--line)", padding: "22px 18px", textAlign: "center", color: "var(--ink-3)", fontSize: ".85rem" }}>
        © {new Date().getFullYear()} {t("home.footer")}
      </footer>

      {/* ===== Login modal ===== */}
      {open && (
        <div onClick={() => setOpen(false)} role="dialog" aria-modal="true"
          style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(6,10,14,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflow: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, position: "relative" }}>
            <button onClick={() => setOpen(false)} aria-label="close"
              style={{ position: "absolute", top: -6, right: -6, zIndex: 1, width: 34, height: 34, borderRadius: 999, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow)" }}>
              <Icon icon={X} className="h-5 w-5" />
            </button>
            <LoginForm embedded />
          </div>
        </div>
      )}

      <style>{`
        .krok-arrow{ position:absolute; top:50%; transform:translateY(-50%); width:40px; height:40px; border-radius:999px;
          border:1px solid var(--line); background:color-mix(in srgb, var(--surface) 90%, transparent); color:var(--ink);
          cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:var(--shadow); }
        .krok-slide{ display:grid; grid-template-columns:1fr 1fr; align-items:center; gap:20px; padding:clamp(20px,4vw,40px); }
        .krok-slide-text{ text-align:left; }
        .krok-slide-shot{ display:flex; justify-content:center; }
        @media(max-width:760px){
          .krok-slide{ grid-template-columns:1fr; }
          .krok-slide-shot{ order:-1; }
          .krok-arrow{ width:34px; height:34px; }
        }
      `}</style>
    </div>
  );
}
