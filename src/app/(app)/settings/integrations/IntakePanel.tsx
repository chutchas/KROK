"use client";
// แท็บ "API รับข้อมูลเข้า" — ให้ระบบภายนอกยิงค่ามาเติมฟอร์มแทนการกรอกเอง
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Field, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { KeyRound, Copy, Check, RefreshCw, Trash2, Save } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { rotateIntakeKey, revokeIntakeKey, saveIntake } from "./intake-actions";
import type { FormOption } from "./IntegrationsClient";

export interface IntakeConfig {
  enabled: boolean;
  fieldKeys: Record<string, string>;
  /** "t:<teamId>" | "u:<userId>" | "" (ตามผู้รับผิดชอบขั้นแรกของฟอร์ม) */
  assignee: string;
  keyPrefix: string | null;
  keyCreatedAt: string | null;
  lastUsedAt: string | null;
}

const EMPTY: IntakeConfig = { enabled: false, fieldKeys: {}, assignee: "", keyPrefix: null, keyCreatedAt: null, lastUsedAt: null };
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;

function sampleValue(type: string): unknown {
  switch (type) {
    case "number": return 120;
    case "datetime": return "2026-10-01T08:30";
    case "pass_fail": return "pass";
    case "checkbox": return ["A01"];
    case "table": return [{ "<คอลัมน์>": "ค่า" }];
    default: return "ตัวอย่าง";
  }
}

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function IntakePanel({ forms, intake, teams, members }: {
  forms: FormOption[];
  intake: Record<string, IntakeConfig>;
  teams: { id: string; name: string }[];
  members: { user_id: string; name: string }[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [formId, setFormId] = useState(forms[0]?.id ?? "");
  const form = forms.find((f) => f.id === formId) ?? null;
  const saved = intake[formId] ?? EMPTY;
  // แก้ไขค่าของฟอร์มที่เลือกอยู่ (เปลี่ยนฟอร์ม = เริ่มจากค่าที่บันทึกไว้ของฟอร์มนั้น)
  const [edits, setEdits] = useState<Record<string, IntakeConfig>>({});
  const cfg = edits[formId] ?? saved;
  const setCfg = (patch: Partial<IntakeConfig>) => setEdits((e) => ({ ...e, [formId]: { ...cfg, ...patch } }));

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [newKey, setNewKey] = useState<{ formId: string; key: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const keyOf = (fid: string) => cfg.fieldKeys[fid]?.trim() || fid;
  const keyErrors = useMemo(() => {
    if (!form) return {} as Record<string, string>;
    const errs: Record<string, string> = {};
    const seen = new Map<string, string>();
    for (const f of form.fields) {
      const own = cfg.fieldKeys[f.id]?.trim();
      if (own && !KEY_RE.test(own)) errs[f.id] = t("intake.keyBad");
      const k = own || f.id;
      if (seen.has(k)) { errs[f.id] = t("intake.keyDup"); errs[seen.get(k)!] = t("intake.keyDup"); }
      seen.set(k, f.id);
    }
    return errs;
  }, [form, cfg.fieldKeys, t]);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://<your-domain>";
  const endpoint = `${origin}/api/v1/forms/${formId}/intake`;
  const sample = useMemo(() => {
    if (!form) return "";
    const data: Record<string, unknown> = {};
    for (const f of form.fields) if (f.type !== "photo" && f.type !== "signature") data[keyOf(f.id)] = sampleValue(f.type);
    return JSON.stringify({ data, ref: "ERP-000123", mode: "auto", source: "ERP" }, null, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, cfg.fieldKeys]);
  const curl = `curl -X POST '${endpoint}' \\
  -H 'Authorization: Bearer ${newKey?.formId === formId ? newKey.key : `${saved.keyPrefix ?? "kfi_"}…`}' \\
  -H 'Content-Type: application/json' \\
  -d '${sample.replace(/'/g, "'\\''")}'`;

  async function copy(text: string, tag: string) {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }

  async function save() {
    if (!form || Object.keys(keyErrors).length) return;
    setBusy("save"); setMsg(null);
    const r = await saveIntake(formId, { enabled: cfg.enabled, field_keys: cfg.fieldKeys, assignee: cfg.assignee });
    setBusy(null);
    if ("error" in r) { setMsg({ t: r.error, err: true }); return; }
    setMsg({ t: t("intake.saved") });
    setEdits((e) => { const n = { ...e }; delete n[formId]; return n; });
    router.refresh();
  }

  async function rotate() {
    if (saved.keyPrefix && !confirm(t("intake.rotateConfirm"))) return;
    setBusy("rotate"); setMsg(null);
    const r = await rotateIntakeKey(formId);
    setBusy(null);
    if ("error" in r) { setMsg({ t: r.error, err: true }); return; }
    setNewKey({ formId, key: r.key });
    router.refresh();
  }

  async function revoke() {
    if (!confirm(t("intake.revokeConfirm"))) return;
    setBusy("revoke"); setMsg(null);
    const r = await revokeIntakeKey(formId);
    setBusy(null);
    if ("error" in r) { setMsg({ t: r.error, err: true }); return; }
    setNewKey(null);
    router.refresh();
  }

  const box: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 10, padding: 12 };
  const sel: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem" };
  const pre: React.CSSProperties = { margin: 0, padding: 12, borderRadius: 8, background: "var(--code-bg)", border: "1px solid var(--line)", fontSize: ".76rem", overflowX: "auto", whiteSpace: "pre" };
  const dirty = !!edits[formId];

  if (!forms.length) return <Card><p style={{ margin: 0, color: "var(--ink-2)" }}>{t("intake.noForms")}</p></Card>;

  return (
    <Card>
      <h2 style={{ fontSize: "1.1rem", marginBottom: 4 }}>{t("intake.title")}</h2>
      <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 0, lineHeight: 1.55 }}>{t("intake.sub")}</p>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label style={{ fontSize: ".85rem", color: "var(--ink-2)" }}>{t("intake.form")}</label>
          <select value={formId} onChange={(e) => { setFormId(e.target.value); setMsg(null); }} style={{ ...sel, marginTop: 4 }}>
            {forms.map((f) => <option key={f.id} value={f.id}>{f.icon} {f.title}{intake[f.id]?.enabled ? ` · ${t("intake.on")}` : ""}</option>)}
          </select>
        </div>

        {form && (<>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".92rem", cursor: "pointer" }}>
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
            {t("intake.enable")}
          </label>

          {/* API key */}
          <div style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Icon icon={KeyRound} className="h-4 w-4" />
              <b style={{ fontSize: ".9rem" }}>API key</b>
              <span style={{ fontFamily: "monospace", fontSize: ".82rem", color: "var(--ink-2)" }}>
                {saved.keyPrefix ? `${saved.keyPrefix}••••••••` : t("intake.noKey")}
              </span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <Button onClick={rotate} loading={busy === "rotate"} style={{ fontSize: ".82rem", padding: "6px 12px" }}>
                  <Icon icon={saved.keyPrefix ? RefreshCw : KeyRound} className="h-4 w-4" /> {saved.keyPrefix ? t("intake.rotate") : t("intake.createKey")}
                </Button>
                {saved.keyPrefix && (
                  <Button variant="ghost" onClick={revoke} loading={busy === "revoke"} style={{ fontSize: ".82rem", padding: "6px 10px", color: "var(--fail)" }} title={t("intake.revoke")}>
                    <Icon icon={Trash2} className="h-4 w-4" />
                  </Button>
                )}
              </span>
            </div>
            {saved.keyPrefix && (
              <div style={{ fontSize: ".76rem", color: "var(--ink-3)", marginTop: 6 }}>
                {t("intake.keyCreated")} {fmt(saved.keyCreatedAt)} · {t("intake.lastUsed")} {fmt(saved.lastUsedAt)}
              </div>
            )}
            {newKey?.formId === formId && (
              <div style={{ marginTop: 10 }}>
                <Notice kind="info">{t("intake.keyOnce")}</Notice>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <code style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "var(--code-bg)", border: "1px solid var(--line)", fontSize: ".8rem", overflowX: "auto", whiteSpace: "nowrap" }}>{newKey.key}</code>
                  <Button onClick={() => copy(newKey.key, "key")} style={{ fontSize: ".82rem", padding: "6px 12px" }}>
                    <Icon icon={copied === "key" ? Check : Copy} className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* key ต่อช่อง */}
          <div style={box}>
            <b style={{ fontSize: ".9rem" }}>{t("intake.fields")}</b>
            <p style={{ fontSize: ".78rem", color: "var(--ink-3)", margin: "4px 0 8px" }}>{t("intake.fieldsHint")}</p>
            <div style={{ display: "grid", gap: 6 }}>
              {form.fields.map((f) => {
                const media = f.type === "photo" || f.type === "signature";
                return (
                  <div key={f.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(120px, 200px)", gap: 8, alignItems: "center" }}>
                    <div style={{ minWidth: 0, fontSize: ".86rem" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                        {f.label}{f.required && <span style={{ color: "var(--fail)" }}> *</span>}
                      </span>
                      <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>{f.type}{media ? ` · ${t("intake.noMedia")}` : ""}</span>
                    </div>
                    <div>
                      <Field value={cfg.fieldKeys[f.id] ?? ""} disabled={media} placeholder={f.id}
                        onChange={(e) => setCfg({ fieldKeys: { ...cfg.fieldKeys, [f.id]: e.target.value.slice(0, 64) } })}
                        style={{ width: "100%", fontFamily: "monospace", fontSize: ".82rem", padding: "7px 9px", ...(keyErrors[f.id] ? { borderColor: "var(--fail)" } : {}) }} />
                      {keyErrors[f.id] && <div style={{ fontSize: ".7rem", color: "var(--fail)" }}>{keyErrors[f.id]}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ผู้รับงานที่ข้อมูลยังไม่ครบ */}
          <div style={box}>
            <b style={{ fontSize: ".9rem" }}>{t("intake.assignee")}</b>
            <p style={{ fontSize: ".78rem", color: "var(--ink-3)", margin: "4px 0 8px" }}>{t("intake.assigneeHint")}</p>
            <select value={cfg.assignee} onChange={(e) => setCfg({ assignee: e.target.value })} style={sel}>
              <option value="">{t("intake.assigneeDefault")}</option>
              {teams.length > 0 && <optgroup label={t("wf.groupTeams")}>{teams.map((x) => <option key={x.id} value={`t:${x.id}`}>{t("wf.team")}: {x.name}</option>)}</optgroup>}
              {members.length > 0 && <optgroup label={t("wf.groupPeople")}>{members.map((m) => <option key={m.user_id} value={`u:${m.user_id}`}>{m.name}</option>)}</optgroup>}
            </select>
          </div>

          {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
          <div>
            <Button variant="primary" onClick={save} loading={busy === "save"} disabled={!dirty || Object.keys(keyErrors).length > 0}>
              <Icon icon={Save} className="h-4 w-4" /> {t("common.save")}
            </Button>
          </div>

          {/* วิธีเรียก */}
          <div style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <b style={{ fontSize: ".9rem" }}>{t("intake.howto")}</b>
              <Button variant="ghost" onClick={() => copy(curl, "curl")} style={{ marginLeft: "auto", fontSize: ".8rem", padding: "4px 10px" }}>
                <Icon icon={copied === "curl" ? Check : Copy} className="h-4 w-4" /> curl
              </Button>
            </div>
            <pre style={{ ...pre, marginTop: 8 }}>{curl}</pre>
            <ul style={{ fontSize: ".8rem", color: "var(--ink-2)", margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
              <li>{t("intake.modeAuto")}</li>
              <li>{t("intake.modeSubmit")}</li>
              <li>{t("intake.modeJob")}</li>
              <li>{t("intake.refHint")}</li>
              <li>{t("intake.valuesHint")}</li>
              <li>{t("intake.getHint")}</li>
            </ul>
            <pre style={{ ...pre, marginTop: 8 }}>{`201 { "ok": true, "type": "submission", "id": "…", "ref": "ERP-000123" }
201 { "ok": true, "type": "job", "id": "…", "missing": [{ "key": "photo_front", "label": "…" }], "assigned_to": "ทีม QA" }
200 { "ok": true, "duplicate": true, "type": "submission", "id": "…" }
422 { "error": "ค่าบางช่องไม่ถูกต้อง", "details": [{ "key": "qty", "error": "ต้องเป็นตัวเลข" }] }`}</pre>
          </div>
        </>)}
      </div>
    </Card>
  );
}
