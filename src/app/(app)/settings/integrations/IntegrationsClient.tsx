"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { Bell, Webhook, CloudDownload } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { createWebhook } from "./actions";
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

export default function IntegrationsClient({ webhooks, forms, notify, intake, teams, members, initialTab = "notify" }: {
  webhooks: WebhookItem[];
  forms: FormOption[];
  notify: NotifySettings;
  intake: Record<string, IntakeConfig>;
  teams: { id: string; name: string }[];
  members: { user_id: string; name: string }[];
  initialTab?: IntgTab;
}) {
  const router = useRouter();
  const { t } = useT();
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

      {/* แท็บ: แจ้งเตือน | Webhook ขาออก | API รับข้อมูลเข้า */}
      <div role="tablist" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line)", overflowX: "auto" }}>
        {([
          { k: "notify" as const, label: t("intg.tabNotify"), icon: Bell },
          { k: "webhooks" as const, label: t("intg.tabWebhooks"), icon: Webhook },
          { k: "intake" as const, label: t("intg.tabIntake"), icon: CloudDownload },
        ]).map((x) => {
          const on = tab === x.k;
          return (
            <button key={x.k} role="tab" aria-selected={on} onClick={() => switchTab(x.k)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 12px", marginBottom: -1, border: "none", borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`, background: "none", color: on ? "var(--accent)" : "var(--ink-2)", fontFamily: "inherit", fontSize: ".9rem", fontWeight: on ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap" }}>
              <Icon icon={x.icon} className="h-4 w-4" /> {x.label}
            </button>
          );
        })}
      </div>

      {tab === "notify" && <NotifyPanel initial={notify} />}

      {tab === "intake" && <IntakePanel forms={forms} intake={intake} teams={teams} members={members} />}

      {tab === "webhooks" && (<>
      <Card>
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
      </Card>

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
      </Card>
      </>)}
    </div>
  );
}
