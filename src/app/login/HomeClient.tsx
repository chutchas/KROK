"use client";
import { backdropClose } from "@/lib/backdrop";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LogIn, X } from "lucide-react";
import Icon from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import ThemeToggle from "@/components/ThemeToggle";
import { useLp as useT } from "@/i18n/landing";
import type { AnyKey as MessageKey } from "@/i18n/landing";
import LoginForm from "./LoginForm";
import Hero from "./landing/Hero";
import Flow from "./landing/Flow";
import Tour from "./landing/Tour";
import { Capabilities, UseCases } from "./landing/Grids";
import Security from "./landing/Security";
import Pricing from "./landing/Pricing";
import { Faq, FinalCta } from "./landing/Closing";
import "./landing.css";
import type { Plan } from "@/lib/plans";

const NAV: { href: string; k: MessageKey }[] = [
  { href: "#how", k: "lp.nav.how" },
  { href: "#product", k: "lp.nav.product" },
  { href: "#usecases", k: "lp.nav.usecases" },
  { href: "#security", k: "lp.nav.security" },
  { href: "#pricing", k: "lp.nav.pricing" },
];

export default function HomeClient({ plans }: { plans?: Plan[] }) {
  const { t } = useT();
  const sp = useSearchParams();
  // มาจากลิงก์เชิญ / ลิงก์ยืนยันอีเมล → เปิดหน้าต่างเข้าสู่ระบบทันที
  const [open, setOpen] = useState(() => sp.has("invite") || sp.has("confirmed") || sp.has("auth_error") || sp.has("mfa") || sp.has("deleted") || sp.has("pwreset") || sp.has("next"));
  const [stuck, setStuck] = useState(false);
  const openLogin = useCallback(() => setOpen(true), []);

  // เงาใต้แถบบนจะโผล่เมื่อเริ่มเลื่อน
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ปิด modal ด้วย Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lp" style={{ minHeight: "100dvh" }}>
      <header className={`lp-nav${stuck ? " is-stuck" : ""}`}>
        <div className="lp-nav-in">
          <a href="#top" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LogoMark size={30} title="KROK" />
            <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.28rem", letterSpacing: ".02em" }}>
              KROK
            </b>
          </a>
          <nav className="lp-nav-links">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>{t(n.k)}</a>
            ))}
            <a href="/privacy">{t("legal.privacy")}</a>
            <a href="/terms">{t("legal.terms")}</a>
          </nav>
          <span style={{ flex: 1 }} />
          <ThemeToggle />
          <LanguageToggle />
          <button type="button" onClick={openLogin} className="lp-btn lp-btn-primary lp-btn-sm">
            <Icon icon={LogIn} className="h-4 w-4" /> {t("lp.nav.login")}
          </button>
        </div>
      </header>

      <main id="top">
        <Hero onLogin={openLogin} />
        <Flow />
        <Tour />
        <Capabilities />
        <UseCases />
        <Security />
        <Pricing onLogin={openLogin} plans={plans} />
        <Faq />
        <FinalCta onLogin={openLogin} />
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <span>© {new Date().getFullYear()} KROK · {t("lp.foot.tag")}</span>
          <nav className="lp-foot-links">
            {NAV.slice(1).map((n) => (
              <a key={n.href} href={n.href}>{t(n.k)}</a>
            ))}
            <a href="/privacy">{t("legal.privacy")}</a>
            <a href="/terms">{t("legal.terms")}</a>
          </nav>
        </div>
      </footer>

      {open && (
        <div
          {...backdropClose(() => setOpen(false))}
          role="dialog"
          aria-modal="true"
          aria-label={t("login.signin")}
          style={{
            position: "fixed", inset: 0, zIndex: 80, background: "rgba(6,10,14,.55)",
            display: "flex", justifyContent: "center", padding: 16, overflowY: "auto", overscrollBehavior: "contain",
          }}
        >
          {/* margin auto = อยู่กลางจอเมื่อพอที่ แต่ไม่กระโดดตามความสูงคีย์บอร์ดมือถือ (align-items:center ทำให้กล่องขยับทุกครั้งที่คีย์บอร์ดเปลี่ยนขนาด) */}
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, position: "relative", margin: "auto 0" }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="close"
              style={{
                position: "absolute", top: -6, right: -6, zIndex: 1, width: 34, height: 34, borderRadius: 999,
                border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow)",
              }}
            >
              <Icon icon={X} className="h-5 w-5" />
            </button>
            <LoginForm embedded />
          </div>
        </div>
      )}
    </div>
  );
}
