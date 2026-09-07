"use client";
import { useState } from "react";
import { Card, Button, Field, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { MessageSquare, Mail, Send } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { saveNotify, testNotify, type NotifyInput } from "./actions";
import type { NotifySettings } from "./IntegrationsClient";

const label: React.CSSProperties = { display: "block", fontSize: ".82rem", fontWeight: 600, margin: "10px 0 4px", color: "var(--ink-2)" };
const hint: React.CSSProperties = { fontSize: ".74rem", color: "var(--ink-3)", marginTop: 3 };

function Check({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: ".86rem", cursor: "pointer" }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
      {children}
    </label>
  );
}

export default function NotifyPanel({ initial }: { initial: NotifySettings }) {
  const { t } = useT();
  const [s, setS] = useState<NotifySettings>(initial);
  const [lineToken, setLineToken] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [toText, setToText] = useState(initial.email_to.join(", "));
  const [busy, setBusy] = useState(false);
  const [testingCh, setTestingCh] = useState<"line" | "email" | null>(null);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  const set = <K extends keyof NotifySettings>(k: K, v: NotifySettings[K]) => setS((p) => ({ ...p, [k]: v }));

  function buildInput(): NotifyInput {
    const email_to = toText.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    return {
      line_enabled: s.line_enabled,
      line_token: lineToken,
      line_target: s.line_target,
      email_enabled: s.email_enabled,
      smtp_host: s.smtp_host,
      smtp_port: Number(s.smtp_port) || 0,
      smtp_user: s.smtp_user,
      smtp_pass: smtpPass,
      email_from: s.email_from,
      email_to,
      on_created: s.on_created,
      on_approved: s.on_approved,
      on_rejected: s.on_rejected,
      fail_only: s.fail_only,
    };
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await saveNotify(buildInput());
    setBusy(false);
    if ("error" in res) { setMsg({ t: res.error, err: true }); return; }
    // ล้างช่องความลับ + อัปเดตธง "บันทึกแล้ว"
    if (lineToken) { setS((p) => ({ ...p, hasLineToken: true })); setLineToken(""); }
    if (smtpPass) { setS((p) => ({ ...p, hasSmtpPass: true })); setSmtpPass(""); }
    setMsg({ t: t("notify.saved") });
  }

  async function test(ch: "line" | "email") {
    setTestingCh(ch);
    setMsg(null);
    const res = await testNotify(ch);
    setTestingCh(null);
    setMsg({ t: `${ch === "line" ? "LINE" : "Email"}: ${res.status}`, err: !res.ok });
  }

  return (
    <Card>
      <h2 style={{ fontSize: "1.1rem", marginBottom: 4 }}>{t("notify.title")}</h2>
      <p style={{ color: "var(--ink-2)", fontSize: ".88rem", marginTop: 0 }}>{t("notify.subtitle")}</p>

      {/* LINE */}
      <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Icon icon={MessageSquare} className="h-4 w-4" />
          <b style={{ fontSize: ".95rem" }}>{t("notify.line")}</b>
        </div>
        <Check on={s.line_enabled} onChange={(v) => set("line_enabled", v)}>{t("notify.lineEnable")}</Check>
        <label style={label}>{t("notify.lineToken")}</label>
        <Field type="password" value={lineToken} onChange={(e) => setLineToken(e.target.value)}
          placeholder={s.hasLineToken ? t("notify.secretSaved") : ""} style={{ width: "100%" }} autoComplete="off" />
        <div style={hint}>{t("notify.lineTokenHint")}</div>
        <label style={label}>{t("notify.lineTarget")}</label>
        <Field value={s.line_target} onChange={(e) => set("line_target", e.target.value)} style={{ width: "100%" }} />
        <div style={hint}>{t("notify.lineTargetHint")}</div>
        <div style={{ marginTop: 10 }}>
          <Button onClick={() => test("line")} disabled={testingCh === "line"} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon icon={Send} className="h-4 w-4" /> {testingCh === "line" ? t("notify.testing") : t("notify.test")}
          </Button>
        </div>
      </div>

      {/* Email */}
      <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Icon icon={Mail} className="h-4 w-4" />
          <b style={{ fontSize: ".95rem" }}>{t("notify.email")}</b>
        </div>
        <Check on={s.email_enabled} onChange={(v) => set("email_enabled", v)}>{t("notify.emailEnable")}</Check>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <div>
            <label style={label}>{t("notify.smtpHost")}</label>
            <Field value={s.smtp_host} onChange={(e) => set("smtp_host", e.target.value)} placeholder="smtp.gmail.com" style={{ width: "100%" }} />
          </div>
          <div>
            <label style={label}>{t("notify.smtpPort")}</label>
            <Field type="number" value={String(s.smtp_port)} onChange={(e) => set("smtp_port", Number(e.target.value))} style={{ width: "100%" }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={label}>{t("notify.smtpUser")}</label>
            <Field value={s.smtp_user} onChange={(e) => set("smtp_user", e.target.value)} style={{ width: "100%" }} autoComplete="off" />
          </div>
          <div>
            <label style={label}>{t("notify.smtpPass")}</label>
            <Field type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)}
              placeholder={s.hasSmtpPass ? t("notify.secretSaved") : ""} style={{ width: "100%" }} autoComplete="off" />
          </div>
        </div>
        <label style={label}>{t("notify.emailFrom")}</label>
        <Field type="email" value={s.email_from} onChange={(e) => set("email_from", e.target.value)} placeholder="no-reply@company.com" style={{ width: "100%" }} />
        <label style={label}>{t("notify.emailTo")}</label>
        <textarea value={toText} onChange={(e) => setToText(e.target.value)} rows={2}
          style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem", resize: "vertical", boxSizing: "border-box" }} />
        <div style={{ marginTop: 10 }}>
          <Button onClick={() => test("email")} disabled={testingCh === "email"} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon icon={Send} className="h-4 w-4" /> {testingCh === "email" ? t("notify.testing") : t("notify.test")}
          </Button>
        </div>
      </div>

      {/* events */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: ".82rem", fontWeight: 600, color: "var(--ink-2)", marginBottom: 7 }}>{t("notify.events")}</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Check on={s.on_created} onChange={(v) => set("on_created", v)}>{t("notify.evCreated")}</Check>
          <Check on={s.on_approved} onChange={(v) => set("on_approved", v)}>{t("notify.evApproved")}</Check>
          <Check on={s.on_rejected} onChange={(v) => set("on_rejected", v)}>{t("notify.evRejected")}</Check>
        </div>
        <div style={{ marginTop: 8 }}>
          <Check on={s.fail_only} onChange={(v) => set("fail_only", v)}>{t("notify.failOnly")}</Check>
        </div>
      </div>

      {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

      <div style={{ marginTop: 14 }}>
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? t("notify.saving") : t("notify.save")}
        </Button>
      </div>
    </Card>
  );
}
