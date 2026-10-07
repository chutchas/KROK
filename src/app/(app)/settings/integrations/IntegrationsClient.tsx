"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AsyncButton, Card, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { Bell, Webhook, CloudDownload, Sparkles, Lock, Check, PauseCircle } from "lucide-react";
import Link from "next/link";
import { UNLIMITED, fmtLimit } from "@/lib/plans";
import { useT } from "@/i18n/LanguageProvider";
import { createWebhook, disableNotify } from "./actions";
import { disableIntake } from "./intake-actions";
import { localizeServerMsg } from "@/i18n/stored-text";
import NotifyPanel from "./NotifyPanel";
import IntakePanel, { type IntakeConfig } from "./IntakePanel";
import WebhookForm from "./WebhookForm";
import WebhookCard from "./WebhookCard";

export interface NotifySettings {
  line_enabled: boolean;
  hasLineToken: boolean;
  line_target: string;
  line_broadcast: boolean;
  email_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  hasSmtpPass: boolean;
  email_from: string;
  email_to: string[];
  on_created: boolean;
  on_approved: boolean;
  on_rejected: boolean;
  fail_only: boolean;
  on_case: boolean;
}

export interface FormField { id: string; label: string; type: string; required?: boolean }
export interface FormOption { id: string; title: string; icon: string; fields: FormField[] }
export interface WebhookItem {
  id: string;
  name: string;
  url: string;
  events: string[];
  hasSecret: boolean;
  active: boolean;
  lastStatus: string | null;
  lastAt: string | null;
  formId: string | null;
  formTitle: string | null;
  fields: string[];
}

type IntgTab = "notify" | "webhooks" | "intake";

type PlanName = { name: string; nameEn: string } | null;
export interface PlanGate {
  name: string; nameEn: string; notify: boolean; maxWebhooks: number; maxIntakeForms: number; usedWebhooks?: number; usedIntake?: number; workspaces?: number;
  /** แพ็กเกจแรกที่มีฟีเจอร์นี้ */
  unlock?: { notify: PlanName; webhook: PlanName; intake: PlanName };
  /** ลดแพ็กเกจที่ตั้งเวลาไว้: ชื่อ + วันที่ + ฟีเจอร์ที่จะหยุด */
  pending?: { name: string; nameEn: string; at: string; notify: boolean; maxWebhooks: number; maxIntakeForms: number } | null;
}

export default function IntegrationsClient({ webhooks, forms, notify, intake, teams, members, initialTab = "notify", plan }: {
  plan?: PlanGate;
  webhooks: WebhookItem[];
  forms: FormOption[];
  notify: NotifySettings;
  intake: Record<string, IntakeConfig>;
  teams: { id: string; name: string }[];
  members: { user_id: string; name: string }[];
  initialTab?: IntgTab;
}) {
  const router = useRouter();
  const { t, tt, lang } = useT();
  const planName = plan ? (lang === "en" ? plan.nameEn : plan.name) : "";
  // ยอดรวมทุก workspace ของเจ้าของบัญชี (ส่งมาจาก server) · ไม่มี = นับใน workspace นี้
  const intakeOn = plan?.usedIntake ?? Object.values(intake).filter((x) => x.enabled).length;
  const webhookUsed = plan?.usedWebhooks ?? webhooks.length;
  const webhookFull = !!plan && plan.maxWebhooks < UNLIMITED && webhookUsed >= plan.maxWebhooks;
  const allWs = plan && (plan.workspaces ?? 1) > 1 ? ` ${tt("intg.allWs", { n: plan.workspaces ?? 1 })}` : "";
  const notifyLocked = !!plan && !plan.notify;
  const webhookLocked = !!plan && plan.maxWebhooks <= 0;
  const intakeLocked = !!plan && plan.maxIntakeForms <= 0;
  const unlockName = (k: "notify" | "webhook" | "intake") => { const u = plan?.unlock?.[k]; return u ? (lang === "en" ? u.nameEn : u.name) : ""; };
  const legacyIntake = forms.filter((f) => intake[f.id]?.enabled);
  // ลดแพ็กเกจที่ตั้งเวลาไว้: ฟีเจอร์ที่ใช้อยู่และจะหยุดเมื่อถึงวัน
  const pend = plan?.pending;
  const willStop = pend ? [
    !pend.notify && (notify.line_enabled || notify.email_enabled) && t("intg.tabNotify"),
    pend.maxWebhooks <= 0 && webhooks.some((w) => w.active) && "Webhook",
    pend.maxIntakeForms <= 0 && legacyIntake.length > 0 && t("intg.tabIntake"),
  ].filter(Boolean) as string[] : [];
  const overWebhook = !!plan && plan.maxWebhooks > 0 && plan.maxWebhooks < UNLIMITED && webhookUsed > plan.maxWebhooks;
  const [tab, setTab] = useState<IntgTab>(initialTab);
  function switchTab(next: IntgTab) {
    setTab(next);
    router.replace(next === "notify" ? "/settings/integrations" : `/settings/integrations?tab=${next}`, { scroll: false });
  }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, minWidth: 0 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("intg.title")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("intg.subtitle")}</p>
      </div>

      {pend && willStop.length > 0 && (
        <Notice>{tt("intg.pendingStop", { to: lang === "en" ? pend.nameEn : pend.name, date: new Date(pend.at).toLocaleDateString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }), what: willStop.join(" · ") })}</Notice>
      )}

      {/* แท็บ: แจ้งเตือน | Webhook ขาออก | API รับข้อมูลเข้า */}
      <div role="tablist" style={{ display: "flex", gap: 4, boxShadow: "inset 0 -1px 0 var(--line)", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" }}>
        {([
          { k: "notify" as const, label: t("intg.tabNotify"), icon: Bell, locked: notifyLocked },
          { k: "webhooks" as const, label: t("intg.tabWebhooks"), icon: Webhook, locked: webhookLocked },
          { k: "intake" as const, label: t("intg.tabIntake"), icon: CloudDownload, locked: intakeLocked },
        ]).map((x) => {
          const on = tab === x.k;
          return (
            <button key={x.k} role="tab" aria-selected={on} onClick={() => switchTab(x.k)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 12px", border: "none", borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`, background: "none", color: on ? "var(--accent)" : "var(--ink-2)", fontFamily: "inherit", fontSize: ".9rem", fontWeight: on ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap" }}>
              <Icon icon={x.icon} className="h-4 w-4" /> {x.label}
              {x.locked && <span title={t("intg.lockedTab")} style={{ display: "inline-flex", color: "var(--ink-3)" }}><Icon icon={Lock} className="h-3.5 w-3.5" /></span>}
            </button>
          );
        })}
      </div>

      {tab === "notify" && (notifyLocked ? (<>
        <FeatureLock icon={Bell} title={t("intg.lk.notify.title")} bullets={[t("intg.lk.notify.b1"), t("intg.lk.notify.b2"), t("intg.lk.notify.b3")]} current={planName} unlock={unlockName("notify")} />
        {(notify.line_enabled || notify.email_enabled) && (
          <Legacy title={t("intg.legacyNotify")} action={<AsyncButton onClick={async () => { const r = await disableNotify(); if ("error" in r) setMsg({ t: localizeServerMsg(r.error, lang), err: true }); router.refresh(); }} style={{ padding: "8px 12px", fontSize: ".85rem" }}><Icon icon={PauseCircle} className="h-4 w-4" /> {t("intg.legacyNotifyOff")}</AsyncButton>}>
            {notify.line_enabled && <li>LINE → {notify.line_broadcast ? t("intg.legacyLineAll") : notify.line_target || "—"}</li>}
            {notify.email_enabled && <li>{t("intg.legacyEmail")} → {notify.email_to.join(", ") || "—"}</li>}
          </Legacy>
        )}
        {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
      </>) : <NotifyPanel initial={notify} />)}

      {tab === "intake" && plan && !intakeLocked && plan.maxIntakeForms < UNLIMITED && <Usage text={tt("intg.useIntake", { used: intakeOn, max: fmtLimit(plan.maxIntakeForms) }) + allWs} full={intakeOn >= plan.maxIntakeForms} />}
      {tab === "intake" && (intakeLocked ? (<>
        <FeatureLock icon={CloudDownload} title={t("intg.lk.intake.title")} bullets={[t("intg.lk.intake.b1"), t("intg.lk.intake.b2"), t("intg.lk.intake.b3")]} current={planName} unlock={unlockName("intake")} />
        {legacyIntake.length > 0 && (
          <Legacy title={t("intg.legacyIntake")}>
            {legacyIntake.map((f) => (
              <li key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 0 }}>{f.title}</span>
                <AsyncButton onClick={async () => { const r = await disableIntake(f.id); if ("error" in r) setMsg({ t: localizeServerMsg(r.error, lang), err: true }); router.refresh(); }} style={{ padding: "6px 10px", fontSize: ".82rem" }}>
                  <Icon icon={PauseCircle} className="h-4 w-4" /> {t("intg.legacyIntakeOff")}
                </AsyncButton>
              </li>
            ))}
          </Legacy>
        )}
        {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
      </>) : <IntakePanel forms={forms} intake={intake} teams={teams} members={members} />)}

      {tab === "webhooks" && webhookLocked && (<>
        <FeatureLock icon={Webhook} title={t("intg.lk.webhook.title")} bullets={[t("intg.lk.webhook.b1"), t("intg.lk.webhook.b2"), t("intg.lk.webhook.b3")]} current={planName} unlock={unlockName("webhook")}>
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontSize: ".85rem", color: "var(--accent-text)", fontWeight: 600 }}>{t("intg.lk.payload")}</summary>
            <Payload />
          </details>
        </FeatureLock>
        {webhooks.length > 0 && (
          <Legacy title={t("intg.legacyWebhook")}>
            <div style={{ display: "grid", gap: 10 }}>
              {webhooks.map((w) => <WebhookCard key={w.id} w={w} forms={forms} onMsg={setMsg} locked />)}
            </div>
          </Legacy>
        )}
        {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
      </>)}
      {tab === "webhooks" && plan && !webhookLocked && plan.maxWebhooks < UNLIMITED && <Usage text={tt("intg.useWebhook", { used: webhookUsed, max: fmtLimit(plan.maxWebhooks) }) + allWs} full={webhookFull} />}
      {tab === "webhooks" && overWebhook && plan && <Notice kind="error">{tt("intg.overWebhook", { used: webhookUsed, max: plan.maxWebhooks })}</Notice>}
      {tab === "webhooks" && !webhookLocked && (<>
      {!webhookFull && <Card>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 4 }}>{t("intg.addTitle")}</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 0 }}>{t("intg.addSub")}</p>
        <WebhookForm forms={forms} busy={busy} submitLabel={t("intg.add")} onSubmit={async (d) => {
          setBusy(true);
          setMsg(null);
          const res = await createWebhook(d.name, d.url, d.events, d.secret, d.formId || null, d.fields);
          setBusy(false);
          if ("error" in res) { setMsg({ t: res.error, err: true }); return false; }
          setMsg({ t: t("intg.added") });
          router.refresh();
          return true;
        }} />
        {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
      </Card>}
      {webhookFull && msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

      <Card>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>{t("intg.listTitle")} ({webhooks.length})</h2>
        {webhooks.length === 0 && <p style={{ color: "var(--ink-3)", fontSize: ".85rem" }}>{t("intg.empty")}</p>}
        <div style={{ display: "grid", gap: 10 }}>
          {webhooks.map((w) => <WebhookCard key={w.id} w={w} forms={forms} onMsg={setMsg} />)}
        </div>
      </Card>

      <Card>
        <h2 style={{ fontSize: "1.05rem", marginBottom: 6 }}>{t("intg.payloadTitle")}</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 0 }}>{t("intg.payloadSub")}</p>
        <Payload />
      </Card>
      </>)}
    </div>
  );
}

function Payload() {
  return (
    <pre style={{ background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, fontSize: ".76rem", overflowX: "auto", color: "var(--ink)" }}>{`POST <your url>
X-KROK-Event: submission.created
X-KROK-Delivery: <uuid ของการส่งครั้งนี้ — ใช้กันประมวลผลซ้ำ>
X-KROK-Timestamp: <unix seconds>
X-KROK-Signature: sha256=<hmac(body) ด้วย secret>
X-KROK-Signature-V2: sha256=<hmac("<timestamp>.<body>") — แนะนำ: ปฏิเสธถ้า timestamp เก่ากว่า 5 นาที>

{
  "event": "submission.created",
  "sent_at": "2026-01-01T08:00:00.000Z",
  "data": {
    "submission_id": "…",
    "form_title": "ตรวจ forklift",
    "user_name": "สมชาย",
    "result": "pass",
    "fails": [],
    "answers": [ … ]
  }
}`}</pre>
  );
}

/** แพ็กเกจไม่รวมฟีเจอร์นี้: บอกว่าได้อะไร + แพ็กเกจที่เริ่มมี + ปุ่มดูแพ็กเกจ (ไม่แสดงช่องตั้งค่า) */
function FeatureLock({ icon, title, bullets, current, unlock, children }: {
  icon: typeof Bell; title: string; bullets: string[]; current: string; unlock: string; children?: React.ReactNode;
}) {
  const { t, tt } = useT();
  return (
    <Card style={{ border: "1px solid var(--accent)", background: "linear-gradient(180deg, var(--accent-soft), var(--surface) 70%)" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--accent-text)", flex: "0 0 auto" }}>
          <Icon icon={icon} className="h-5 w-5" />
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 2px", display: "flex", alignItems: "center", gap: 6 }}>{title} <Icon icon={Lock} className="h-4 w-4" /></h2>
          <p style={{ color: "var(--ink-2)", fontSize: ".85rem", margin: 0 }}>
            {unlock ? tt("intg.lk.from", { plan: unlock }) : t("intg.lk.upgrade")} · {tt("intg.lk.current", { plan: current })}
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 6 }}>
            {bullets.map((b) => (
              <li key={b} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: ".9rem", lineHeight: 1.5 }}>
                <span style={{ color: "var(--pass)", display: "inline-flex", marginTop: 2 }}><Icon icon={Check} className="h-4 w-4" /></span>{b}
              </li>
            ))}
          </ul>
          <Link href="/settings/billing/plans" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, background: "var(--accent)", color: "var(--accent-ink)", borderRadius: 8, padding: "9px 16px", fontSize: ".88rem", fontWeight: 600, textDecoration: "none" }}>
            <Icon icon={Sparkles} className="h-4 w-4" /> {t("intg.upgrade")}
          </Link>
          {children}
        </div>
      </div>
    </Card>
  );
}

/** ของที่ตั้งไว้ก่อนลดแพ็กเกจ (หมดรอบแล้ว) — หยุดทำงาน · ปิด/ลบได้ แก้ไขไม่ได้ · อัปเกรดแล้วกลับมาทำงานเอง */
function Legacy({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "1.02rem", margin: 0, flex: 1, minWidth: 200 }}>{title}</h2>
        {action}
      </div>
      <p style={{ color: "var(--fail)", fontSize: ".84rem", margin: "6px 0 10px", lineHeight: 1.6, display: "flex", gap: 6, alignItems: "flex-start" }}>
        <span style={{ display: "inline-flex", marginTop: 3 }}><Icon icon={PauseCircle} className="h-4 w-4" /></span>{t("intg.stoppedNote")}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8, fontSize: ".9rem" }}>{children}</ul>
    </Card>
  );
}

function Usage({ text, full }: { text: string; full: boolean }) {
  const { t } = useT();
  return (
    <div style={{ fontSize: ".84rem", color: full ? "var(--fail)" : "var(--ink-3)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span>{text}</span>
      {full && <Link href="/settings/billing/plans" style={{ color: "var(--accent-text)", fontWeight: 600 }}>{t("intg.upgrade")}</Link>}
    </div>
  );
}
