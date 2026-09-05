"use client";
import { useState } from "react";
import { Button, Field } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import Icon from "@/components/Icon";
import { Globe } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import type { FormSchema } from "@/lib/form-schema";
import FillWizard from "@/app/(app)/fill/[formId]/FillWizard";

// หน้ากรอกฟอร์มสาธารณะ (ไม่ต้อง login) — ขอชื่อผู้กรอกก่อน แล้วเข้าสู่ wizard เดิมในโหมด public
export default function PublicFillClient({
  formId, title, icon, version, requiresApproval, approvalChain, schema, tenantId,
}: {
  formId: string; title: string; icon: string; version: number;
  requiresApproval: boolean; approvalChain: unknown[]; schema: FormSchema; tenantId: string;
}) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [started, setStarted] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #f8fafc)", color: "var(--ink)" }}>
      <header style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)", padding: "12px 16px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
          <LogoMark size={26} variant="compact" title="KROK" />
          <b className="brand-text" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.1rem", letterSpacing: ".02em" }}>KROK</b>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".76rem", color: "var(--pass)" }}>
            <Icon icon={Globe} className="h-3.5 w-3.5" /> {t("qr.public")}
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 80px" }}>
        {!started ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: 22, boxShadow: "var(--shadow)", marginTop: 12 }}>
            <div style={{ fontSize: "1.6rem" }}>{icon}</div>
            <h1 style={{ fontSize: "1.25rem", margin: "6px 0 4px" }}>{title}</h1>
            <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>{t("pubfill.intro")}</p>
            <label style={{ display: "block", fontSize: ".85rem", fontWeight: 600, margin: "12px 0 6px" }}>{t("pubfill.yourName")}</label>
            <Field value={name} onChange={(e) => setName(e.target.value)} placeholder={t("pubfill.namePlaceholder")} style={{ width: "100%" }} maxLength={120} />
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
            publicMode
          />
        )}
      </main>
    </div>
  );
}
