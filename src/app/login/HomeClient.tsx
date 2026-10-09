"use client";
import { backdropClose } from "@/lib/backdrop";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import Icon from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import ThemeToggle from "@/components/ThemeToggle";
import { useLp as useT } from "@/i18n/landing";
import type { AnyKey as MessageKey } from "@/i18n/landing";
import LoginForm from "./LoginForm";
import Hero from "./landing/Hero";
import { How, Jobs, Pain } from "./landing/Story";
import { UseCases } from "./landing/Grids";
import Security from "./landing/Security";
import Pricing from "./landing/Pricing";
import { Faq, FinalCta } from "./landing/Closing";
import "./landing.css";
import type { Plan } from "@/lib/plans";

const NAV: { href: string; k: MessageKey }[] = [
  { href: "#how", k: "lp.nav.features" },
  { href: "#pricing", k: "lp.nav.pricing" },
  { href: "#faq", k: "lp.nav.faq" },
];

export default function HomeClient({ plans }: { plans?: Plan[] }) {
  const { t } = useT();
  const sp = useSearchParams();
  // มาจากลิงก์เชิญ / ลิงก์ยืนยันอีเมล → เปิดหน้าต่างเข้าสู่ระบบทันที
  const [open, setOpen] = useState(() => sp.has("invite") || sp.has("confirmed") || sp.has("auth_error") || sp.has("mfa") || sp.has("deleted") || sp.has("pwreset") || (sp.has("next") && sp.get("next") !== "/"));
  const [stuck, setStuck] = useState(false);
  const openLogin = useCallback(() => setOpen(true), []);

  // เงาใต้แถบบนจะโผล่เมื่อเริ่มเลื่อน
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // หน้าต่างเข้าสู่ระบบ: โฟกัสเข้าไปในกล่อง · Tab วนในกล่อง · Esc ปิด · ปิดแล้วโฟกัสกลับปุ่มที่เปิด
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeLogin = useCallback(() => setOpen(false), []);
  useDialogA11y(dialogRef, closeLogin, { active: open });

  return (
    <div className="lp" style={{ minHeight: "100dvh" }}>
      <noscript><style>{`.lp-rv{opacity:1!important;transform:none!important}`}</style></noscript>
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
          </nav>
          <span style={{ flex: 1 }} />
          <ThemeToggle />
          <LanguageToggle />
          <button type="button" onClick={openLogin} className="lp-nav-login">{t("lp.nav.login")}</button>
          <button type="button" onClick={openLogin} className="lp-btn lp-btn-primary lp-btn-sm lp-nav-start">{t("lp.nav.start")}</button>
        </div>
      </header>

      <main id="top">
        <Hero onLogin={openLogin} />
        <Pain />
        <How />
        <Jobs />
        <UseCases />
        <Security />
        <Pricing onLogin={openLogin} plans={plans} />
        <Faq />
        <FinalCta onLogin={openLogin} />
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <span className="lp-foot-brand">
            <LogoMark size={22} title="KROK" />
            <b className="brand-text">KROK</b>
            <span>© {new Date().getFullYear()} · {t("lp.foot.tag")}</span>
          </span>
          <nav className="lp-foot-links">
            <a href="/privacy">{t("legal.privacy")}</a>
            <a href="/terms">{t("legal.terms")}</a>
            <a href="/contact">{t("lp.foot.contact")}</a>
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
          <div ref={dialogRef} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, position: "relative", margin: "auto 0" }}>
            <LoginForm embedded />
            {/* ปุ่มปิดอยู่ในกรอบ (เดิมล้นขอบครึ่งปุ่ม) · อยู่หลังฟอร์มใน DOM → โฟกัสแรกตกที่ช่องกรอก */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("common.close")}
              style={{
                position: "absolute", top: 6, right: 6, zIndex: 1, width: 44, height: 44, borderRadius: 999,
                border: "none", background: "transparent", color: "var(--ink-2)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Icon icon={X} className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
