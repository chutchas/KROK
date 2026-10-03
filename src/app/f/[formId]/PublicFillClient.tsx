"use client";
import { useRef, useState } from "react";
import Turnstile, { type CaptchaHandle } from "@/components/Turnstile";
import { Button, Field } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import Icon from "@/components/Icon";
import { Globe, Info, ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import type { FormSchema } from "@/lib/form-schema";
import type { Attachment } from "@/lib/attachments";
import FillWizard from "@/app/(app)/fill/[formId]/FillWizard";
import { resolveTheme, type WorkspaceBranding } from "@/lib/theme";
import { ThemeStyle } from "@/components/FormBrand";

// หน้ากรอกฟอร์มสาธารณะ (ไม่ต้อง login) — ขอชื่อผู้กรอกก่อน แล้วเข้าสู่ wizard เดิมในโหมด public
export default function PublicFillClient({
  formId, title, icon, version, requiresApproval, approvalChain, schema, tenantId, loggedIn = false, attachments = [], orgName = "", privacyNotice, branding = null,
}: {
  formId: string; title: string; icon: string; version: number;
  requiresApproval: boolean; approvalChain: unknown[]; schema: FormSchema; tenantId: string;
  loggedIn?: boolean;
  attachments?: Attachment[];
  /** ชื่อองค์กรเจ้าของฟอร์ม (ผู้ควบคุมข้อมูล) */
  orgName?: string;
  /** ประกาศความเป็นส่วนตัวที่เจ้าของฟอร์มเขียนเอง */
  privacyNotice?: string;
  /** แบรนด์ของ workspace เจ้าของฟอร์ม */
  branding?: WorkspaceBranding | null;
}) {
  const { t, tt } = useT();
  const [name, setName] = useState("");
  const [started, setStarted] = useState(false);
  const captcha = useRef<CaptchaHandle | null>(null);
  const theme = resolveTheme(branding, schema.theme);
  const scope = `krok-pub-${formId.replace(/[^a-z0-9]/gi, "").slice(0, 12)}`;

  return (
    <div className={scope} style={{ minHeight: "100vh", background: "var(--ground)", color: "var(--ink)" }}>
      <ThemeStyle scope={scope} theme={theme} />
      <header style={{ borderBottom: theme.custom ? `3px solid ${theme.header}` : "1px solid var(--line)", background: "var(--surface)", padding: "12px 16px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
          {theme.logo ? (
            // ฟอร์มของบริษัท: แสดงโลโก้ + ชื่อองค์กรแทนแบรนด์ KROK
            <>
              <img src={theme.logo} alt="" style={{ height: 30, maxWidth: 140, objectFit: "contain", display: "block" }} />
              {orgName && <b style={{ fontSize: ".95rem", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orgName}</b>}
            </>
          ) : (
            <>
              <LogoMark size={26} variant="compact" title="KROK" />
              <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.1rem", letterSpacing: ".02em" }}>KROK</b>
            </>
          )}
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".76rem", color: "var(--pass)" }}>
            <Icon icon={Globe} className="h-3.5 w-3.5" /> {t("qr.public")}
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 80px" }}>
        {loggedIn && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "var(--accent-soft)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", marginTop: 12, fontSize: ".82rem", color: "var(--ink-2)" }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}><Icon icon={Info} className="h-4 w-4" /></span>
            <span>{t("pubfill.guestNotice")}</span>
          </div>
        )}
        {!started ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: 22, boxShadow: "var(--shadow)", marginTop: 12 }}>
            <div style={{ fontSize: "1.6rem" }}>{icon}</div>
            <h1 style={{ fontSize: "1.25rem", margin: "6px 0 4px" }}>{title}</h1>
            <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>{t("pubfill.intro")}</p>
            <label style={{ display: "block", fontSize: ".85rem", fontWeight: 600, margin: "12px 0 6px" }}>{t("pubfill.yourName")}</label>
            <Field value={name} onChange={(e) => setName(e.target.value)} placeholder={t("pubfill.namePlaceholder")} style={{ width: "100%" }} maxLength={120} />
            {/* ประกาศความเป็นส่วนตัว (PDPA ม.23) — แจ้งก่อนเก็บข้อมูล */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", marginTop: 14, fontSize: ".8rem", color: "var(--ink-2)", lineHeight: 1.6 }}>
              <span style={{ flexShrink: 0, marginTop: 2, color: "var(--accent-text)" }}><Icon icon={ShieldCheck} className="h-4 w-4" /></span>
              <div style={{ minWidth: 0 }}>
                <b style={{ color: "var(--ink)" }}>{t("pubfill.privacyTitle")}</b>
                {privacyNotice && <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 2 }}>{privacyNotice}</div>}
                <div style={{ marginTop: 2 }}>{tt("pubfill.privacyDefault", { org: orgName || title })}</div>
                <a href="/privacy" target="_blank" rel="noopener" style={{ display: "inline-block", marginTop: 2 }}>{t("legal.privacy")}</a>
              </div>
            </div>
            <Button variant="primary" onClick={() => name.trim() && setStarted(true)} disabled={!name.trim()} style={{ width: "100%", marginTop: 14 }}>
              {t("pubfill.start")}
            </Button>
          </div>
        ) : (
          <FillWizard
            formId={formId}
            title={title}
            icon={icon}
            version={version}
            requiresApproval={requiresApproval}
            approvalChain={approvalChain}
            schema={schema}
            tenantId={tenantId}
            userId=""
            userName={name.trim()}
            attachments={attachments}
            publicMode
            branding={branding}
            captcha={captcha}
          />
        )}
        {/* CAPTCHA อยู่ตลอดระหว่างกรอก (token ต่ออายุเอง) */}
        <div className="no-print"><Turnstile handle={captcha} /></div>
      </main>
      <footer className="no-print" style={{ textAlign: "center", fontSize: ".76rem", color: "var(--ink-3)", padding: "0 16px 28px" }}>
        <a href="/privacy" target="_blank" rel="noopener" style={{ color: "inherit" }}>{t("legal.privacy")}</a> · <a href="/terms" target="_blank" rel="noopener" style={{ color: "inherit" }}>{t("legal.terms")}</a>
        {theme.logo && <> · {t("pubfill.poweredBy")}</>}
      </footer>
    </div>
  );
}
