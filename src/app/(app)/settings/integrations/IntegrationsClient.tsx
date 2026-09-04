"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Field, Notice, Pill } from "@/components/ui";
import Icon from "@/components/Icon";
import { Check, Lock, Zap } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { createWebhook, toggleWebhook, deleteWebhook, testWebhookById } from "./actions";

export interface WebhookItem {
  id: string;
  name: string;
  url: string;
  events: string[];
  hasSecret: boolean;
  active: boolean;
  lastStatus: string | null;
  lastAt: string | null;
}

const ALL_EVENTS = ["submission.created", "submission.approved", "submission.rejected"] as const;

export default function IntegrationsClient({ webhooks }: { webhooks: WebhookItem[] }) {
  const router = useRouter();
  const { t } = useT();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<string[]>(["submission.created"]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const eventLabel = (e: string) =>
    e === "submission.created" ? t("intg.evCreated") : e === "submission.approved" ? t("intg.evApproved") : t("intg.evRejected");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await createWebhook(name, url, events, secret);
    setBusy(false);
    if ("error" in res) setMsg({ t: res.error, err: true });
    else {
      setName(""); setUrl(""); setSecret(""); setEvents(["submission.created"]);
      setMsg({ t: t("intg.added") });
      router.refresh();
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("intg.title")}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("intg.subtitle")}</p>
      </div>

      <Card>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 4 }}>{t("intg.addTitle")}</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 0 }}>{t("intg.addSub")}</p>
        <form onSubmit={add} style={{ display: "grid", gap: 10 }}>
          <Field value={name} onChange={(e) => setName(e.target.value)} placeholder={t("intg.namePlaceholder")} />
          <Field value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." required />
          <div>
            <div style={{ fontSize: ".85rem", color: "var(--ink-2)", marginBottom: 6 }}>{t("intg.events")}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ALL_EVENTS.map((ev) => {
                const on = events.includes(ev);
                return (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => setEvents((s) => (on ? s.filter((x) => x !== ev) : [...s, ev]))}
                    style={{
                      padding: "7px 12px", borderRadius: 20, fontSize: ".82rem", cursor: "pointer", fontFamily: "inherit",
                      border: on ? "1px solid var(--accent)" : "1px solid var(--line)",
                      background: on ? "var(--accent-soft)" : "var(--surface)",
                      color: on ? "var(--accent)" : "var(--ink-2)", fontWeight: on ? 600 : 500,
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{on && <Icon icon={Check} className="h-3.5 w-3.5" />}{eventLabel(ev)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <Field value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={t("intg.secretPlaceholder")} />
          <div>
            <Button variant="primary" type="submit" disabled={busy || !url.trim()}>{busy ? "…" : t("intg.add")}</Button>
          </div>
        </form>
        {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
      </Card>

      <Card>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>{t("intg.listTitle")} ({webhooks.length})</h2>
        {webhooks.length === 0 && <p style={{ color: "var(--ink-3)", fontSize: ".85rem" }}>{t("intg.empty")}</p>}
        <div style={{ display: "grid", gap: 10 }}>
          {webhooks.map((w) => (
            <div key={w.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, background: "var(--surface)", opacity: w.active ? 1 : 0.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <b style={{ fontSize: ".95rem" }}>{w.name}</b>
                  {w.active ? <Pill kind="pass">{t("intg.on")}</Pill> : <Pill kind="na">{t("intg.off")}</Pill>}
                  {w.hasSecret && <span style={{ fontSize: ".72rem", color: "var(--ink-3)", marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={Lock} className="h-3 w-3" /> {t("intg.signed")}</span>}
                  <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem", overflowWrap: "anywhere", marginTop: 2 }}>{w.url}</small>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {w.events.map((ev) => (
                  <span key={ev} style={{ fontSize: ".72rem", color: "var(--ink-2)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 20, padding: "2px 9px" }}>
                    {eventLabel(ev)}
                  </span>
                ))}
              </div>
              {w.lastStatus && (
                <div style={{ fontSize: ".76rem", color: w.lastStatus.includes("error") ? "var(--fail)" : "var(--ink-3)", marginTop: 8 }}>
                  {t("intg.lastResult")}: {w.lastStatus}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <Button
                  onClick={async () => {
                    setTesting(w.id);
                    const r = await testWebhookById(w.id);
                    setTesting(null);
                    setMsg({ t: `${w.name}: ${r.status}`, err: !r.ok });
                    router.refresh();
                  }}
                  disabled={testing === w.id}
                >
                  {testing === w.id ? "…" : <><Icon icon={Zap} className="h-4 w-4" /> {t("intg.test")}</>}
                </Button>
                <Button onClick={async () => { await toggleWebhook(w.id, !w.active); router.refresh(); }}>
                  {w.active ? t("intg.disable") : t("intg.enable")}
                </Button>
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (!confirm(t("intg.deleteConfirm"))) return;
                    await deleteWebhook(w.id);
                    router.refresh();
                  }}
                >
                  {t("common.delete")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 style={{ fontSize: "1.05rem", marginBottom: 6 }}>{t("intg.payloadTitle")}</h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 0 }}>{t("intg.payloadSub")}</p>
        <pre style={{ background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, fontSize: ".76rem", overflowX: "auto", color: "var(--ink)" }}>{`POST <your url>
X-KROK-Event: submission.created
X-KROK-Signature: sha256=<hmac ของ body ด้วย secret>

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
    </div>
  );
}
