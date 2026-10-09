"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import ThemeToggle from "@/components/ThemeToggle";
import LegalContact from "@/components/LegalContact";
import Icon from "@/components/Icon";
import { CheckCircle2, Send } from "lucide-react";
import { Button, Field, TextArea } from "@/components/ui";
import { useT } from "@/i18n/LanguageProvider";
import { localizeServerMsg } from "@/i18n/stored-text";
import { cleanContact, contactErrors, SEAT_OPTIONS, TOPIC_OPTIONS, type ContactField, type ContactInput, type ContactTopic } from "@/lib/contact";

const EMPTY: ContactInput = { name: "", company: "", email: "", phone: "", seats: "", topic: "", message: "" };
const lbl: React.CSSProperties = { display: "block", fontSize: ".84rem", fontWeight: 600, color: "var(--ink-2)", marginBottom: 4 };
const errSt: React.CSSProperties = { color: "var(--fail)", fontSize: ".8rem", marginTop: 4 };
const bad: React.CSSProperties = { borderColor: "var(--fail)", boxShadow: "0 0 0 1px var(--fail)" };
const selSt: React.CSSProperties = { width: "100%", padding: "11px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: "1rem" };

type Me = { name: string; email: string; company: string } | null;

/** ฟอร์มติดต่อทีม KROK — ใช้ทั้งหน้าสาธารณะ (/contact) และในแอป (/help/contact) · me = ผู้ใช้ที่ล็อกอิน (เติมให้) */
export function ContactForm({ me, defaultTopic }: { me: Me; defaultTopic: ContactTopic | "" }) {
  const { t, lang } = useT();
  const [v, setV] = useState<ContactInput>(() => ({ ...EMPTY, ...(me || {}), topic: defaultTopic }));
  const home = me ? "/dashboard" : "/login";
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [hp, setHp] = useState(""); // ช่องลับกันบอท
  const opened = useRef(0);
  useEffect(() => { opened.current = Date.now(); }, []); // เวลาเปิดหน้า (กันบอทที่ส่งทันที)

  const errs = new Set(contactErrors(cleanContact(v)));
  const show = (f: ContactField) => errs.has(f) && (tried || !!touched[f]);
  const set = (f: ContactField) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [f]: e.target.value }));
  const blur = (f: ContactField) => () => setTouched((x) => ({ ...x, [f]: true }));
  const errText: Record<ContactField, string> = {
    name: t("contact.errName"), email: t("contact.errEmail"), phone: t("contact.errPhone"), message: t("contact.errMessage"), company: "", seats: "", topic: "",
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setErr("");
    if (errs.size) { document.querySelector<HTMLElement>("[data-contact] [aria-invalid='true']")?.focus(); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, website: hp, elapsed: Date.now() - (opened.current || Date.now()), lang }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) { setErr(localizeServerMsg(j.error || t("contact.failed"), lang)); return; }
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setErr(t("contact.failed"));
    } finally {
      setBusy(false);
    }
  }

  const input = (f: ContactField, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`c-${f}`} style={lbl}>{label}</label>
      <Field id={`c-${f}`} value={v[f]} onChange={set(f)} onBlur={blur(f)} aria-invalid={show(f)} aria-describedby={show(f) ? `c-err-${f}` : undefined}
        style={{ width: "100%", ...(show(f) ? bad : {}) }} {...props} />
      {show(f) && <div id={`c-err-${f}`} role="alert" style={errSt}>{errText[f]}</div>}
    </div>
  );

  return (
    <section style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--surface)", padding: "clamp(18px, 4vw, 28px)", boxShadow: "var(--shadow)" }}>
      {done ? (
        <div role="status" style={{ textAlign: "center", padding: "30px 8px" }}>
          <span style={{ color: "var(--pass)", display: "inline-flex" }}><Icon icon={CheckCircle2} className="h-10 w-10" /></span>
          <h2 style={{ fontSize: "1.2rem", margin: "10px 0 6px" }}>{t("contact.doneTitle")}</h2>
          <p style={{ color: "var(--ink-2)", margin: 0 }}>{t("contact.doneSub")}</p>
          <Link href={home} style={{ display: "inline-block", marginTop: 18 }}>{me ? t("contact.backApp") : t("contact.backHome")}</Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate data-contact style={{ display: "grid", gap: 14 }}>
          <div>
            <label htmlFor="c-topic" style={lbl}>{t("contact.topic")}</label>
            <select id="c-topic" value={v.topic} onChange={set("topic")} style={selSt}>
              <option value="">{t("contact.seatsPick")}</option>
              {TOPIC_OPTIONS.map((o) => <option key={o} value={o}>{t(`contact.topic.${o}`)}</option>)}
            </select>
          </div>
          <div className="krok-contact-2">
            {input("name", `${t("contact.name")} *`, { autoComplete: "name" })}
            {input("company", t("contact.company"), { autoComplete: "organization" })}
          </div>
          <div className="krok-contact-2">
            {input("email", `${t("contact.email")} *`, { autoComplete: "email", autoCapitalize: "none", spellCheck: false, placeholder: "name@company.com" })}
            {input("phone", t("contact.phone"), { autoComplete: "tel", inputMode: "tel" })}
          </div>
          <div>
            <label htmlFor="c-seats" style={lbl}>{t("contact.seats")}</label>
            <select id="c-seats" value={v.seats} onChange={set("seats")} style={selSt}>
              <option value="">{t("contact.seatsPick")}</option>
              {SEAT_OPTIONS.map((o) => <option key={o} value={o}>{o} {t("contact.people")}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="c-message" style={lbl}>{t("contact.message")} *</label>
            <TextArea id="c-message" rows={5} value={v.message} onChange={set("message")} onBlur={blur("message")} placeholder={t("contact.messagePh")}
              aria-invalid={show("message")} aria-describedby={show("message") ? "c-err-message" : undefined} style={{ width: "100%", ...(show("message") ? bad : {}) }} />
            {show("message") && <div id="c-err-message" role="alert" style={errSt}>{errText.message}</div>}
          </div>
          {/* ช่องลับกันบอท: คนมองไม่เห็น */}
          <div aria-hidden style={{ position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" }}>
            <label>Website<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} name="website" /></label>
          </div>
          {err && <div role="alert" style={{ color: "var(--fail)", fontSize: ".88rem" }}>{err}</div>}
          <Button variant="primary" type="submit" loading={busy} style={{ padding: 13 }}>
            <Icon icon={Send} className="h-4 w-4" /> {busy ? t("contact.sending") : t("contact.send")}
          </Button>
          <small style={{ color: "var(--ink-3)", fontSize: ".78rem", lineHeight: 1.6 }}>
            {t("contact.privacyPre")} <Link href="/privacy" target="_blank">{t("legal.privacy")}</Link>
          </small>
        </form>
      )}
      <style>{`.krok-contact-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:560px){.krok-contact-2{grid-template-columns:minmax(0,1fr)}}`}</style>
    </section>
  );
}

/** หน้า "ติดต่อเรา" สาธารณะ (ยังไม่ล็อกอิน) — ล็อกอินอยู่ถูกส่งไป /help/contact */
export default function ContactClient({ me, defaultTopic }: { me: Me; defaultTopic: ContactTopic | "" }) {
  const { t, lang } = useT();
  const home = me ? "/dashboard" : "/login";
  return (
    <div style={{ minHeight: "100vh", background: "var(--ground)", color: "var(--ink)" }}>
      <header style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)", padding: "12px 0" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={home} style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
            <LogoMark size={28} title="KROK" />
            <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.1rem" }}>KROK</b>
          </Link>
          <Link href={me ? "/dashboard" : "/login#pricing"} style={{ marginLeft: "auto", fontSize: ".86rem" }}>{me ? t("contact.backApp") : t("contact.backPricing")}</Link>
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </header>

      <main className="krok-contact" style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px 80px" }}>
        <section>
          <h1 style={{ fontSize: "1.7rem", margin: "0 0 8px" }}>{t("contact.title")}</h1>
          <p style={{ color: "var(--ink-2)", lineHeight: 1.7, margin: "0 0 20px" }}>{me ? t("contact.subMember") : t("contact.sub")}</p>
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", padding: "14px 18px", lineHeight: 1.8, fontSize: ".92rem" }}>
            <LegalContact en={lang === "en"} />
          </div>
        </section>

        <ContactForm me={me} defaultTopic={defaultTopic} />
      </main>
      <style>{`
        .krok-contact{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:32px;align-items:start}
        @media(max-width:860px){.krok-contact{grid-template-columns:minmax(0,1fr);gap:20px}}
      `}</style>
    </div>
  );
}

/** ติดต่อทีม KROK ในแอป (อยู่ใน navbar ของแอป) */
export function ContactInApp({ me, defaultTopic }: { me: NonNullable<Me>; defaultTopic: ContactTopic | "" }) {
  const { t, lang } = useT();
  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("contact.title")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("contact.subMember")}</p>
      </div>
      <div className="krok-contact-app">
        <ContactForm me={me} defaultTopic={defaultTopic} />
        <aside style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", padding: "14px 18px", lineHeight: 1.8, fontSize: ".9rem" }}>
          <LegalContact en={lang === "en"} />
        </aside>
      </div>
      <style>{`
        .krok-contact-app{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:20px;align-items:start}
        @media(max-width:860px){.krok-contact-app{grid-template-columns:minmax(0,1fr)}}
      `}</style>
    </div>
  );
}
