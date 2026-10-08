"use client";
// Studio › ตั้งค่าปุ่มเปิดฟอร์มลูก (0074)
// เลือกฟอร์มลูก → จับคู่ "ส่งไป" (ขั้นแรกของฟอร์มลูก ← ช่องของใบนี้/ค่าคงที่) → "รับกลับ" (คอลัมน์ตารางในขั้นเดียวกัน ← ช่องของฟอร์มลูก)
// จับคู่ด้วยรหัสฟิลด์ (เปลี่ยนชื่อช่องได้ไม่พัง) · ชนิดที่รับได้: ข้อความ ตัวเลข วันเวลา เลือก 1 ข้อ
import { useEffect, useMemo, useState } from "react";
import { Settings2, X } from "lucide-react";
import Icon from "@/components/Icon";
import BodyPortal from "@/components/BodyPortal";
import { backdropClose } from "@/lib/backdrop";
import { useT } from "@/i18n/LanguageProvider";
import { CHILD_MAP_TYPES, type ChildFormConfig, type FormField, type FormSchema } from "@/lib/form-schema";
import { segmentEnd } from "@/lib/case-flow";
import { listChildFormCandidates, type ChildCandidate } from "@/app/(app)/studio/child-form-actions";

const COL_TYPES = ["text", "number", "select", "datetime"];
const CONST = "__const__";

export default function ChildFormSettings({ schema, stepIndex, field, onPatch }: {
  schema: FormSchema;
  stepIndex: number;
  field: FormField;
  onPatch: (p: Partial<FormField>) => void;
}) {
  const { t, tt } = useT();
  const [open, setOpen] = useState(false);
  const cfg = field.child_form;
  // ก่อนส่งต่อครั้งแรกยังไม่มีงาน → ปุ่มยังกดไม่ได้ (ช่วงแรก = ขั้น 0..segmentEnd(0))
  const inFirstSegment = stepIndex <= segmentEnd(schema, 0);

  return (
    <div style={{ marginTop: 8, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface-2)", display: "grid", gap: 8 }}>
      <p style={{ fontSize: ".8rem", color: "var(--ink-2)", margin: 0 }}>
        {cfg ? tt("child.cfgSummary", { form: cfg.form_title || "—", send: cfg.send.length, map: cfg.map.length }) : t("child.notConfigured")}
      </p>
      {cfg && !cfg.table_id && <p style={{ fontSize: ".76rem", color: "var(--amber)", margin: 0 }}>{t("child.cfgPickTable")}</p>}
      {inFirstSegment && <p style={{ fontSize: ".76rem", color: "var(--amber)", margin: 0 }}>{t("child.cfgFirstSeg")}</p>}
      <p style={{ fontSize: ".74rem", color: "var(--ink-3)", margin: 0 }}>{t("child.cfgWhoHint")}</p>
      <button type="button" onClick={() => setOpen(true)}
        style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent-soft)", color: "var(--accent-text)", fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}>
        <Icon icon={Settings2} className="h-4 w-4" /> {t("child.cfgEdit")}
      </button>
      {open && <ChildFormDialog schema={schema} stepIndex={stepIndex} field={field} onClose={() => setOpen(false)}
        onSave={(c) => { onPatch({ child_form: c, label: field.label?.trim() ? field.label : tt("child.open", { form: c.form_title || "" }) }); setOpen(false); }} />}
    </div>
  );
}

function ChildFormDialog({ schema, stepIndex, field, onClose, onSave }: {
  schema: FormSchema; stepIndex: number; field: FormField;
  onClose: () => void; onSave: (c: ChildFormConfig) => void;
}) {
  const { t } = useT();
  const [forms, setForms] = useState<ChildCandidate[] | null>(null);
  const [err, setErr] = useState("");
  const init = field.child_form;
  const [formId, setFormId] = useState(init?.form_id ?? "");
  const [send, setSend] = useState<ChildFormConfig["send"]>(init?.send ?? []);
  const [tableId, setTableId] = useState(init?.table_id ?? "");
  const [map, setMap] = useState<ChildFormConfig["map"]>(init?.map ?? []);
  const [multiple, setMultiple] = useState(init?.multiple ?? true);
  const [gate, setGate] = useState(init?.gate ?? true);
  const [sourceOnly, setSourceOnly] = useState(init?.source_only ?? false);

  useEffect(() => {
    let alive = true;
    listChildFormCandidates().then((r) => { if (!alive) return; if ("error" in r) { setErr(r.error); setForms([]); } else setForms(r.forms); });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { alive = false; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const child = forms?.find((f) => f.id === formId) ?? null;
  // ช่องของใบนี้ที่ส่งได้: ขั้นนี้และก่อนหน้า ชนิดที่รองรับ
  const parentFields = useMemo(() => schema.steps.slice(0, stepIndex + 1).flatMap((s) => s.fields).filter((f) => CHILD_MAP_TYPES.includes(f.type)), [schema, stepIndex]);
  const tables = schema.steps[stepIndex]?.fields.filter((f) => f.type === "table") ?? [];
  const table = tables.find((x) => x.id === tableId);
  const childFirst = child?.steps[0]?.fields.filter((f) => CHILD_MAP_TYPES.includes(f.type)) ?? [];
  const childAll = child?.steps.flatMap((s) => s.fields).filter((f) => CHILD_MAP_TYPES.includes(f.type)) ?? [];
  const childIds = new Set(childAll.map((f) => f.id));
  const missingMap = map.filter((m) => !childIds.has(m.from));

  const sendOf = (to: string) => send.find((s) => s.to === to);
  const setSendFor = (to: string, v: { from?: string; value?: string } | null) =>
    setSend((xs) => [...xs.filter((s) => s.to !== to), ...(v ? [{ to, ...v }] : [])]);
  const setMapFor = (col: string, from: string) => setMap((xs) => [...xs.filter((m) => m.col !== col), ...(from ? [{ col, from }] : [])]);

  function pickForm(id: string) {
    setFormId(id);
    if (id !== init?.form_id) { setSend([]); setMap([]); }
  }

  function save() {
    if (!child) return;
    onSave({
      form_id: child.id, form_title: child.title,
      send: send.filter((s) => childFirst.some((f) => f.id === s.to)),
      table_id: tableId,
      map: map.filter((m) => childIds.has(m.from) && (table?.columns || []).some((c) => c.id === m.col)),
      multiple, gate, source_only: sourceOnly,
    });
  }

  const sel: React.CSSProperties = { width: "100%", padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".86rem" };
  const h: React.CSSProperties = { fontSize: ".92rem", margin: "16px 0 6px" };
  const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", gap: 8, alignItems: "center", fontSize: ".84rem" };
  const chk: React.CSSProperties = { display: "flex", gap: 8, alignItems: "flex-start", fontSize: ".84rem", marginTop: 6 };

  return (
    <BodyPortal>
      <div {...backdropClose(onClose)} role="dialog" aria-modal="true" aria-label={t("child.cfgTitle")}
        style={{ position: "fixed", inset: 0, background: "rgba(10,14,18,.55)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
        <div style={{ background: "var(--surface)", borderRadius: 14, maxWidth: 620, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ fontSize: "1.1rem", margin: 0, flex: 1 }}>{t("child.cfgTitle")}</h2>
            <button type="button" onClick={onClose} aria-label={t("common.close")} style={{ border: "none", background: "none", color: "var(--ink-2)", cursor: "pointer", display: "flex" }}><Icon icon={X} className="h-5 w-5" /></button>
          </div>
          {err && <p role="alert" style={{ color: "var(--fail)", fontSize: ".84rem" }}>{err}</p>}

          <h3 style={h}>{t("child.cfgForm")}</h3>
          {forms === null ? <p style={{ fontSize: ".84rem", color: "var(--ink-3)" }}>{t("common.loading")}</p>
            : forms.length === 0 ? <p style={{ fontSize: ".84rem", color: "var(--ink-3)" }}>{t("child.cfgNoForms")}</p>
            : (
              <select value={formId} onChange={(e) => pickForm(e.target.value)} style={sel} aria-label={t("child.cfgForm")}>
                <option value="">{t("child.cfgPickForm")}</option>
                {forms.map((f) => <option key={f.id} value={f.id} disabled={f.nested}>{f.title}</option>)}
              </select>
            )}

          {child && (
            <>
              <h3 style={h}>{t("child.cfgSend")}</h3>
              <p style={{ fontSize: ".76rem", color: "var(--ink-3)", margin: "0 0 8px" }}>{t("child.cfgSendHint")}</p>
              <div style={{ display: "grid", gap: 6 }}>
                {childFirst.map((cf) => {
                  const cur = sendOf(cf.id);
                  const v = cur?.from ?? (cur && "value" in cur ? CONST : "");
                  return (
                    <div key={cf.id} style={row}>
                      <span style={{ overflowWrap: "anywhere" }}>{cf.label}</span>
                      <div style={{ display: "grid", gap: 4 }}>
                        <select value={v} style={sel} aria-label={cf.label}
                          onChange={(e) => { const x = e.target.value; setSendFor(cf.id, !x ? null : x === CONST ? { value: cur?.value ?? "" } : { from: x }); }}>
                          <option value="">{t("child.cfgFromNone")}</option>
                          {parentFields.map((pf) => <option key={pf.id} value={pf.id}>{pf.label}</option>)}
                          <option value={CONST}>{t("child.cfgFromConst")}</option>
                        </select>
                        {v === CONST && <input value={cur?.value ?? ""} placeholder={t("child.cfgConstPh")} maxLength={500}
                          onChange={(e) => setSendFor(cf.id, { value: e.target.value })} style={sel} />}
                        {cur?.from && !parentFields.some((p) => p.id === cur.from) && <span style={{ fontSize: ".74rem", color: "var(--amber)" }}>{t("child.cfgMissing")}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <h3 style={h}>{t("child.cfgReturn")}</h3>
              {tables.length === 0 ? <p style={{ fontSize: ".82rem", color: "var(--amber)" }}>{t("child.cfgNoTable")}</p> : (
                <>
                  <label style={{ display: "block", fontSize: ".8rem", color: "var(--ink-2)", marginBottom: 4 }}>{t("child.cfgTable")}</label>
                  <select value={tableId} onChange={(e) => { setTableId(e.target.value); setMap([]); }} style={sel}>
                    <option value="">{t("child.cfgPickTable")}</option>
                    {tables.map((tb) => <option key={tb.id} value={tb.id}>{tb.label}</option>)}
                  </select>
                  {table && (
                    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                      {(table.columns || []).filter((c) => COL_TYPES.includes(c.type)).map((c) => (
                        <div key={c.id} style={row}>
                          <span style={{ overflowWrap: "anywhere" }}>{c.label}</span>
                          <select value={map.find((m) => m.col === c.id)?.from ?? ""} onChange={(e) => setMapFor(c.id, e.target.value)} style={sel} aria-label={c.label}>
                            <option value="">{t("child.cfgFromNone")}</option>
                            {child.steps.map((st, si) => (
                              <optgroup key={si} label={`${si + 1}. ${st.title}`}>
                                {st.fields.filter((f) => CHILD_MAP_TYPES.includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      ))}
                      {missingMap.length > 0 && <p style={{ fontSize: ".76rem", color: "var(--amber)", margin: 0 }}>{t("child.cfgMissing")}</p>}
                    </div>
                  )}
                </>
              )}

              <label style={chk}><input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />{t("child.cfgMultiple")}</label>
              <label style={chk}><input type="checkbox" checked={gate} onChange={(e) => setGate(e.target.checked)} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />{t("child.cfgGate")}</label>
              <label style={chk}><input type="checkbox" checked={sourceOnly} onChange={(e) => setSourceOnly(e.target.checked)} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />{t("child.cfgSourceOnly")}</label>
            </>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button type="button" onClick={save} disabled={!child}
              style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-ink)", fontFamily: "inherit", fontWeight: 600, cursor: child ? "pointer" : "not-allowed", opacity: child ? 1 : 0.5 }}>
              {t("child.cfgDone")}
            </button>
            <button type="button" onClick={onClose}
              style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", cursor: "pointer" }}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
