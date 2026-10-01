"use client";
// ============================================================
// KROK · การ์ด webhook 1 รายการ — ทดสอบ / เปิด-ปิด / แก้ไข / ลบ / ประวัติการส่ง
// ============================================================
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button, Pill } from "@/components/ui";
import Icon from "@/components/Icon";
import { InlineFormIcon } from "@/components/FormIcon";
import { Lock, Zap, Pencil, History } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { confirmDialog } from "@/components/dialogs";
import { webhookStatusFailed } from "@/lib/notify-utils";
import { toggleWebhook, deleteWebhook, testWebhookById, updateWebhook, listDeliveries, type DeliveryRow } from "./actions";
import WebhookForm from "./WebhookForm";
import type { FormOption, WebhookItem } from "./IntegrationsClient";

const noopSub = () => () => {};

export default function WebhookCard({ w, forms, onMsg }: {
  w: WebhookItem;
  forms: FormOption[];
  onMsg: (m: { t: string; err?: boolean }) => void;
}) {
  const router = useRouter();
  const { t, lang } = useT();
  const [busy, setBusy] = useState<"" | "test" | "toggle" | "delete" | "save">("");
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<DeliveryRow[] | null>(null);
  const [histOpen, setHistOpen] = useState(false);

  const eventLabel = (e: string) =>
    e === "submission.created" ? t("intg.evCreated") : e === "submission.approved" ? t("intg.evApproved") : t("intg.evRejected");
  const failed = webhookStatusFailed(w.lastStatus);
  // เวลาแสดงตามเขตเวลาของเครื่องผู้ใช้ → render หลัง mount เท่านั้น (กัน hydration mismatch กับ server ที่เป็น UTC)
  const mounted = useSyncExternalStore(noopSub, () => true, () => false);
  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "short", timeStyle: "medium" });

  async function run<T>(k: typeof busy, fn: () => Promise<T>): Promise<T> {
    setBusy(k);
    try { return await fn(); } finally { setBusy(""); }
  }

  async function loadHistory() {
    if (histOpen) { setHistOpen(false); return; }
    setHistOpen(true);
    const r = await listDeliveries(w.id);
    if ("error" in r) { onMsg({ t: r.error, err: true }); setHistory([]); }
    else setHistory(r.rows);
  }

  if (editing) {
    return (
      <div style={{ border: "1px solid var(--accent)", borderRadius: 12, padding: 14, background: "var(--surface)" }}>
        <WebhookForm
          forms={forms} editing hasSecret={w.hasSecret} busy={busy === "save"} submitLabel={t("intg.save")}
          initial={{ name: w.name, url: w.url, events: w.events, formId: w.formId ?? "", fields: w.fields }}
          onCancel={() => setEditing(false)}
          onSubmit={async (d) => {
            const r = await run("save", () => updateWebhook(w.id, { name: d.name, url: d.url, events: d.events, secret: d.secret, clearSecret: d.clearSecret, formId: d.formId || null, fields: d.fields }));
            if ("error" in r) { onMsg({ t: r.error, err: true }); return false; }
            onMsg({ t: t("intg.saved") });
            setEditing(false);
            router.refresh();
            return true;
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${failed && w.active ? "var(--fail)" : "var(--line)"}`, borderRadius: 12, padding: 14, background: "var(--surface)", opacity: w.active ? 1 : 0.6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <b style={{ fontSize: ".95rem" }}>{w.name}</b>
          {w.active ? <Pill kind="pass">{t("intg.on")}</Pill> : <Pill kind="na">{t("intg.off")}</Pill>}
          {w.hasSecret && <span style={{ fontSize: ".72rem", color: "var(--ink-3)", marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={Lock} className="h-3 w-3" /> {t("intg.signed")}</span>}
          <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem", overflowWrap: "anywhere", marginTop: 2 }}>{w.url}</small>
          <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: ".72rem", color: "var(--ink-2)", background: "var(--accent-soft)", border: "1px solid var(--line)", borderRadius: 20, padding: "2px 9px" }}>
              {w.formId ? <><InlineFormIcon value={null} size={14} />{w.formTitle}</> : t("intg.allForms")}
            </span>
            {w.formId && (
              <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>
                {w.fields.length === 0 ? t("intg.allFields") : `${w.fields.length} ${t("intg.fieldsUnit")}`}
              </span>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {w.events.map((ev) => (
          <span key={ev} style={{ fontSize: ".72rem", color: "var(--ink-2)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 20, padding: "2px 9px" }}>{eventLabel(ev)}</span>
        ))}
      </div>
      {w.lastStatus && (
        <div style={{ fontSize: ".76rem", color: failed ? "var(--fail)" : "var(--ink-3)", marginTop: 8, fontWeight: failed ? 600 : 400 }}>
          {t("intg.lastResult")}: {failed && `${t("intg.failed")} · `}{w.lastStatus}{mounted && w.lastAt && ` · ${fmt(w.lastAt)}`}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <Button disabled={!!busy} onClick={async () => {
          const r = await run("test", () => testWebhookById(w.id));
          onMsg({ t: `${w.name}: ${r.status}`, err: !r.ok });
          router.refresh();
        }}>
          {busy === "test" ? "…" : <><Icon icon={Zap} className="h-4 w-4" /> {t("intg.test")}</>}
        </Button>
        <Button disabled={!!busy} onClick={() => setEditing(true)}><Icon icon={Pencil} className="h-4 w-4" /> {t("intg.edit")}</Button>
        <Button disabled={!!busy} onClick={async () => {
          const r = await run("toggle", () => toggleWebhook(w.id, !w.active));
          if ("error" in r) onMsg({ t: r.error, err: true });
          router.refresh();
        }}>
          {busy === "toggle" ? "…" : w.active ? t("intg.disable") : t("intg.enable")}
        </Button>
        <Button onClick={loadHistory} aria-expanded={histOpen}><Icon icon={History} className="h-4 w-4" /> {t("intg.history")}</Button>
        <Button variant="danger" disabled={!!busy} onClick={async () => {
          if (!(await confirmDialog({ message: t("intg.deleteConfirm"), danger: true }))) return;
          const r = await run("delete", () => deleteWebhook(w.id));
          if ("error" in r) onMsg({ t: r.error, err: true });
          router.refresh();
        }}>
          {busy === "delete" ? "…" : t("common.delete")}
        </Button>
      </div>
      {histOpen && (
        <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          {history === null ? <div style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>…</div>
            : history.length === 0 ? <div style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>{t("intg.historyEmpty")}</div>
            : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".76rem" }}>
                  <tbody>
                    {history.map((d) => (
                      <tr key={d.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "4px 6px", whiteSpace: "nowrap", color: "var(--ink-3)" }}>{fmt(d.created_at)}</td>
                        <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>{eventLabel(d.event)}</td>
                        <td style={{ padding: "4px 6px", whiteSpace: "nowrap", fontWeight: 600, color: d.ok ? "var(--pass)" : "var(--fail)" }}>{d.status ?? "—"}</td>
                        <td style={{ padding: "4px 6px", whiteSpace: "nowrap", color: "var(--ink-3)" }}>{d.attempts} {t("intg.attempts")}{d.duration_ms != null && ` · ${d.duration_ms} ms`}</td>
                        <td style={{ padding: "4px 6px", color: "var(--fail)", overflowWrap: "anywhere" }}>{d.error ?? ""}</td>
                        <td style={{ padding: "4px 6px", color: "var(--ink-3)", fontFamily: "monospace", whiteSpace: "nowrap" }} title={d.id}>{d.id.slice(0, 8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
