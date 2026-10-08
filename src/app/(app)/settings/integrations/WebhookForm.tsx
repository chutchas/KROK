"use client";
// ============================================================
// KROK · ฟอร์ม webhook — ใช้ทั้ง "เพิ่มใหม่" และ "แก้ไข" (secret ว่างตอนแก้ = คงเดิม)
// ============================================================
import { useState } from "react";
import { Button, Field } from "@/components/ui";
import Icon from "@/components/Icon";
import { Check } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import type { FormOption } from "./IntegrationsClient";

export const ALL_EVENTS = ["submission.created", "submission.approved", "submission.rejected"] as const;

export interface WebhookDraft {
  name: string;
  url: string;
  events: string[];
  formId: string;
  /** [] = ทุกฟิลด์ */
  fields: string[];
  secret: string;
  clearSecret: boolean;
}

const chip = (on: boolean): React.CSSProperties => ({
  padding: "7px 12px", borderRadius: 20, fontSize: ".82rem", cursor: "pointer", fontFamily: "inherit",
  border: on ? "1px solid var(--accent)" : "1px solid var(--line)",
  background: on ? "var(--accent-soft)" : "var(--surface)",
  color: on ? "var(--accent-text)" : "var(--ink-2)", fontWeight: on ? 600 : 500,
});
const small: React.CSSProperties = { fontSize: ".76rem", padding: "3px 10px", borderRadius: 16, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)" };

export default function WebhookForm({ forms, initial, editing = false, hasSecret = false, busy, submitLabel, onSubmit, onCancel }: {
  forms: FormOption[];
  initial?: Partial<WebhookDraft>;
  editing?: boolean;
  hasSecret?: boolean;
  busy: boolean;
  submitLabel: string;
  onSubmit: (d: WebhookDraft) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const { t } = useT();
  const initForm = forms.find((f) => f.id === initial?.formId) || null;
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [secret, setSecret] = useState("");
  const [clearSecret, setClearSecret] = useState(false);
  const [events, setEvents] = useState<string[]>(initial?.events?.length ? initial.events : ["submission.created"]);
  const [formId, setFormId] = useState<string>(initForm ? initForm.id : "");
  // เก็บ [] = ทุกฟิลด์ → ตอนแก้ไขให้แสดงเป็นติ๊กครบ
  const [fields, setFields] = useState<string[]>(initForm ? (initial?.fields?.length ? initial.fields : initForm.fields.map((x) => x.id)) : []);
  const selForm = forms.find((f) => f.id === formId) || null;

  const eventLabel = (e: string) =>
    e === "submission.created" ? t("intg.evCreated") : e === "submission.approved" ? t("intg.evApproved") : t("intg.evRejected");

  function pickForm(id: string) {
    setFormId(id);
    const f = forms.find((x) => x.id === id);
    // เลือกฟอร์ม → ติ๊กทุกฟิลด์ไว้ก่อน (ผู้ใช้ค่อยเอาออกที่ไม่ต้องการ)
    setFields(f ? f.fields.map((x) => x.id) : []);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // ติ๊กครบทุกฟิลด์ → ส่ง [] (= ทุกฟิลด์ รวมฟิลด์ที่เพิ่มภายหลัง)
    const allChecked = selForm && fields.length === selForm.fields.length;
    const ok = await onSubmit({ name, url, events, formId, fields: allChecked ? [] : fields, secret, clearSecret });
    if (ok && !editing) {
      setName(""); setUrl(""); setSecret(""); setEvents(["submission.created"]); setFormId(""); setFields([]);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
      <Field value={name} onChange={(e) => setName(e.target.value)} placeholder={t("intg.namePlaceholder")} aria-label={t("intg.namePlaceholder")} />
      <Field value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." required aria-label="URL" />
      <div>
        <div style={{ fontSize: ".85rem", color: "var(--ink-2)", marginBottom: 6 }}>{t("intg.events")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ALL_EVENTS.map((ev) => {
            const on = events.includes(ev);
            return (
              <button key={ev} type="button" aria-pressed={on} onClick={() => setEvents((s) => (on ? s.filter((x) => x !== ev) : [...s, ev]))} style={chip(on)}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{on && <Icon icon={Check} className="h-3.5 w-3.5" />}{eventLabel(ev)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div style={{ fontSize: ".85rem", color: "var(--ink-2)", marginBottom: 6 }}>{t("intg.targetForm")}</div>
        <select value={formId} onChange={(e) => pickForm(e.target.value)} aria-label={t("intg.targetForm")}
          style={{ width: "100%", padding: "9px 11px", borderRadius: 10, fontFamily: "inherit", fontSize: ".9rem", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }}>
          <option value="">{t("intg.allForms")}</option>
          {forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
      </div>

      {selForm && selForm.fields.length > 0 && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--surface-2)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: ".85rem", color: "var(--ink-2)" }}>{t("intg.payloadFields")} ({fields.length}/{selForm.fields.length})</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={() => setFields(selForm.fields.map((x) => x.id))} style={small}>{t("intg.selectAll")}</button>
              <button type="button" onClick={() => setFields([])} style={small}>{t("intg.clear")}</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {selForm.fields.map((fld) => {
              const on = fields.includes(fld.id);
              return (
                <button key={fld.id} type="button" aria-pressed={on} onClick={() => setFields((s) => (on ? s.filter((x) => x !== fld.id) : [...s, fld.id]))}
                  style={{ ...chip(on), padding: "6px 11px", borderRadius: 18, fontSize: ".8rem" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{on && <Icon icon={Check} className="h-3.5 w-3.5" />}{fld.label}</span>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: ".73rem", color: "var(--ink-3)", margin: "8px 0 0" }}>{t("intg.payloadFieldsHint")}</p>
        </div>
      )}

      <Field value={secret} onChange={(e) => { setSecret(e.target.value); if (e.target.value) setClearSecret(false); }}
        placeholder={editing && hasSecret ? t("intg.secretKeep") : t("intg.secretPlaceholder")} aria-label="Secret" />
      {editing && hasSecret && !secret && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: ".84rem", cursor: "pointer", color: "var(--ink-2)" }}>
          <input type="checkbox" checked={clearSecret} onChange={(e) => setClearSecret(e.target.checked)} /> {t("intg.secretClear")}
        </label>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="primary" type="submit" disabled={busy || !url.trim() || events.length === 0}>{busy ? "…" : submitLabel}</Button>
        {onCancel && <Button type="button" onClick={onCancel}>{t("intg.cancel")}</Button>}
      </div>
    </form>
  );
}
