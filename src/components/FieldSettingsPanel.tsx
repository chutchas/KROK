"use client";
import { Field } from "@/components/ui";
import Icon from "@/components/Icon";
import { ArrowUp, ArrowDown, Trash2, Copy, Plus, X, ClipboardList } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/LanguageProvider";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import OptionsSourceEditor, { ColumnSourceEditor } from "@/components/OptionsSourceEditor";
import FormulaInput from "@/components/FormulaInput";
import PhotoPrintSettings from "@/components/PhotoPrintSettings";
import {
  FIELD_TYPES,
  type FieldType,
  type FormField,
  type FormSchema,
  type TableColumn,
  type TableColType,
} from "@/lib/form-schema";
import { alertDialog, confirmDialog } from "@/components/dialogs";

let idc = 0;
const newId = (p: string) => `${p}_${Date.now().toString(36)}${(idc++).toString(36)}`;

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const c = [...arr];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

// แผงตั้งค่าฟิลด์/ขั้นตอนที่เลือก — ใช้ร่วมทั้งมุมมองมือถือและกระดาษ
export default function FieldSettingsPanel({
  schema,
  selectedKey,
  onChange,
  onSelect,
  formId = null,
  tenantId = "",
  teams = [],
  members = [],
}: {
  schema: FormSchema;
  selectedKey: string | null;
  onChange: (s: FormSchema) => void;
  onSelect: (key: string | null) => void;
  /** ฟอร์มที่บันทึกแล้วเท่านั้นจึงแนบเอกสารระดับฟิลด์ได้ */
  formId?: string | null;
  tenantId?: string;
  /** ทีมใน workspace — ใช้ตั้งผู้รับผิดชอบขั้นตอน (ฟอร์มกรอกหลายคน) */
  teams?: { id: string; name: string }[];
  /** สมาชิกใน workspace — ตั้งผู้รับผิดชอบเป็นรายบุคคล */
  members?: { user_id: string; name: string }[];
}) {
  const { t, tt } = useT();

  const sel: React.CSSProperties = {
    padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)",
    color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem", width: "100%",
  };
  const iconBtn: React.CSSProperties = {
    height: 32, minWidth: 32, padding: "0 8px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)",
    color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5, justifyContent: "center", fontSize: ".8rem",
  };

  function setSteps(steps: FormSchema["steps"]) { onChange({ ...schema, steps }); }
  function addStep() {
    const id = newId("s");
    setSteps([...schema.steps, { id, title: "", fields: [{ id: newId("f"), type: "text", label: "", required: true }] }]);
    onSelect(`s:${id}`);
  }

  // ----- step header selected -----
  if (selectedKey?.startsWith("s:")) {
    const sid = selectedKey.slice(2);
    const si = schema.steps.findIndex((s) => s.id === sid);
    if (si < 0) return <Empty onAddStep={addStep} />;
    const step = schema.steps[si];
    const patchStep = (p: Partial<typeof step>) => setSteps(schema.steps.map((s, i) => (i === si ? { ...s, ...p } : s)));
    return (
      <Shell title={`${t("editor.step")} ${si + 1}`} onClose={() => onSelect(null)}>
        <label style={lbl}>{t("editor.stepTitle")}</label>
        <Field value={step.title} onChange={(e) => patchStep({ title: e.target.value })} placeholder={t("editor.stepTitle")} />

        <label style={lbl}>{t("wf.assignee")}</label>
        {(() => {
          // ค่าใน select: "t:<teamId>" | "u:<userId>" | "" (ไม่ตั้ง)
          const a = step.assignee;
          const cur = a?.team_id ? `t:${a.team_id}` : a?.user_id ? `u:${a.user_id}` : "";
          const missing = (a?.team_id && !teams.some((tm) => tm.id === a.team_id)) || (a?.user_id && !members.some((m) => m.user_id === a.user_id));
          return (
            <select
              style={sel}
              value={cur}
              onChange={(e) => {
                const v = e.target.value;
                const n = { ...step };
                if (v.startsWith("t:")) n.assignee = { team_id: v.slice(2) };
                else if (v.startsWith("u:")) n.assignee = { user_id: v.slice(2) };
                else delete n.assignee;
                setSteps(schema.steps.map((s, i) => (i === si ? n : s)));
              }}
            >
              <option value="">{si === 0 ? t("wf.assigneeAnyone") : t("wf.assigneeSame")}</option>
              {teams.length > 0 && (
                <optgroup label={t("wf.groupTeams")}>
                  {teams.map((tm) => <option key={tm.id} value={`t:${tm.id}`}>{t("wf.team")}: {tm.name}</option>)}
                </optgroup>
              )}
              {members.length > 0 && (
                <optgroup label={t("wf.groupPeople")}>
                  {members.map((m) => <option key={m.user_id} value={`u:${m.user_id}`}>{m.name}</option>)}
                </optgroup>
              )}
              {missing && <option value={cur}>{a?.team_id ? t("wf.teamMissing") : t("wf.userMissing")}</option>}
            </select>
          );
        })()}
        <p style={{ fontSize: ".78rem", color: "var(--ink-3)", margin: "5px 0 0", lineHeight: 1.45 }}>
          {si === 0 ? t("wf.hintFirst") : t("wf.hintNext")}
          {" "}
          <Link href="/settings/team" target="_blank" style={{ color: "var(--accent)", whiteSpace: "nowrap" }}>
            {teams.length === 0 ? t("wf.createTeam") : t("wf.manageTeams")} ↗
          </Link>
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <button style={iconBtn} aria-label={t("editor.moveUp")} title={t("editor.moveUp")} disabled={si === 0} onClick={() => setSteps(move(schema.steps, si, -1))}><Icon icon={ArrowUp} className="h-4 w-4" /></button>
          <button style={iconBtn} aria-label={t("editor.moveDown")} title={t("editor.moveDown")} disabled={si === schema.steps.length - 1} onClick={() => setSteps(move(schema.steps, si, 1))}><Icon icon={ArrowDown} className="h-4 w-4" /></button>
          <button style={iconBtn} onClick={() => { const fid = newId("f"); patchStep({ fields: [...step.fields, { id: fid, type: "text", label: "", required: true }] }); onSelect(fid); }}>
            <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addField")}
          </button>
          <button style={{ ...iconBtn, color: "var(--fail)", borderColor: "var(--fail)" }} onClick={async () => {
            if (schema.steps.length <= 1) { await alertDialog(t("editor.needOneStep")); return; }
            if (!(await confirmDialog({ message: t("editor.deleteStepConfirm"), danger: true }))) return;
            setSteps(schema.steps.filter((_, i) => i !== si));
            onSelect(null);
          }}><Icon icon={Trash2} className="h-4 w-4" /> {t("editor.deleteStep")}</button>
        </div>
        <FooterAdd onAddStep={addStep} label={t("editor.addStep")} />
      </Shell>
    );
  }

  // ----- document header / meta selected -----
  if (selectedKey === "header" || selectedKey === "meta") {
    const toggle = (key: "show_header" | "show_meta", v: boolean) => {
      const n = { ...schema };
      if (v) delete n[key]; else n[key] = false;
      onChange(n);
    };
    const cbRow = (checked: boolean, label: string, onC: (v: boolean) => void) => (
      <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: ".9rem", color: "var(--ink)", cursor: "pointer", marginTop: 8 }}>
        <input type="checkbox" checked={checked} onChange={(e) => onC(e.target.checked)} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />
        {label}
      </label>
    );
    return (
      <Shell title={t("editor.docHeader")} onClose={() => onSelect(null)}>
        <p style={{ fontSize: ".85rem", color: "var(--ink-2)", marginTop: 0 }}>{t("editor.docHeaderHint")}</p>
        {cbRow(schema.show_header !== false, t("editor.showHeader"), (v) => toggle("show_header", v))}
        {cbRow(schema.show_meta !== false, t("editor.showMeta"), (v) => toggle("show_meta", v))}
        <PhotoPrintSettings schema={schema} onChange={onChange} />
      </Shell>
    );
  }

  // ----- field selected -----
  let si = -1, fi = -1;
  schema.steps.forEach((s, i) => s.fields.forEach((f, j) => { if (f.id === selectedKey) { si = i; fi = j; } }));
  if (si < 0) return <Empty onAddStep={addStep} />;

  const step = schema.steps[si];
  const field = step.fields[fi];
  const patchField = (p: Partial<FormField>) =>
    setSteps(schema.steps.map((s, i) => (i === si ? { ...s, fields: s.fields.map((f, j) => (j === fi ? { ...f, ...p } : f)) } : s)));
  const patchStepFields = (fields: FormField[]) => setSteps(schema.steps.map((s, i) => (i === si ? { ...s, fields } : s)));
  // สแกนบาร์โค้ด/QR = แหล่งเติมข้อมูลแบบสแกนของขั้นตอนนี้ ที่เติมฟิลด์นี้ฟิลด์เดียว (ปุ่มสแกนแสดงในช่องตอนกรอก)
  const scanSrcId = `sc_${field.id}`;
  const hasScan = (step.fill_sources ?? []).some((src) => src.kind === "scan" && src.map.length === 1 && src.map[0].field_id === field.id);
  const setScan = (on: boolean, extra: Partial<FormField> = {}) => {
    const others = (step.fill_sources ?? []).filter((src) => !(src.kind === "scan" && src.map.length === 1 && src.map[0].field_id === field.id));
    const fill_sources = on ? [...others, { id: scanSrcId, label: `สแกน ${field.label || ""}`.trim(), kind: "scan" as const, parse: "raw" as const, map: [{ field_id: field.id, key: "value" }] }] : others;
    setSteps(schema.steps.map((s, i) => (i === si ? { ...s, fill_sources: fill_sources.length ? fill_sources : undefined, fields: s.fields.map((f, j) => (j === fi ? { ...f, ...extra } : f)) } : s)));
  };

  // ----- table column helpers -----
  const cols = field.columns || [];
  const setCols = (columns: TableColumn[]) => patchField({ columns });
  const patchCol = (i: number, p: Partial<TableColumn>) => setCols(cols.map((c, ci) => (ci === i ? { ...c, ...p } : c)));
  const addCol = () => setCols([...cols, { id: newId("c"), label: `คอลัมน์ ${cols.length + 1}`, type: "text" }]);
  const removeCol = (i: number) => setCols(cols.filter((_, ci) => ci !== i));

  return (
    <Shell title={t("editor.fieldSettings")} onClose={() => onSelect(null)}>
      <label style={lbl}>{t("editor.fieldName")}</label>
      <Field value={field.label} onChange={(e) => patchField({ label: e.target.value })} placeholder={t("editor.fieldNamePh")} />

      <label style={lbl}>{t("editor.fieldType")}</label>
      <select value={field.type} onChange={(e) => {
        const nt = e.target.value as FieldType;
        if (nt === "barcode") { setScan(true, { type: "text" }); return; }
        if (nt === "table" && !(field.columns && field.columns.length))
          patchField({ type: nt, columns: [{ id: newId("c"), label: "รายการ", type: "text", width: 3 }, { id: newId("c"), label: "จำนวน", type: "number" }], min_rows: field.min_rows ?? 1 });
        else if (nt === "formula") patchField({ type: nt, required: false, decimals: field.decimals ?? 2 });
        else patchField({ type: nt });
      }} style={sel}>
        {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{t(`ftype.${ft}`)}</option>)}
      </select>
      {field.type === "text" && (
        <>
          <label style={lbl}>{t("editor.textKind")}</label>
          <select style={sel} value={field.text_format ?? (field.long_text ? "long" : "short")}
            onChange={(e) => { const v = e.target.value; patchField({ long_text: v === "long" ? true : undefined, text_format: v === "phone" || v === "email" ? v : undefined }); }}>
            <option value="short">{t("editor.textShort")}</option>
            <option value="long">{t("editor.textLong")}</option>
            <option value="phone">{t("editor.textPhone")}</option>
            <option value="email">{t("editor.textEmail")}</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: ".88rem", color: "var(--ink-2)", cursor: "pointer", marginTop: 10 }}>
            <input type="checkbox" checked={hasScan} onChange={(e) => setScan(e.target.checked)} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />
            {t("editor.textScan")}
          </label>
        </>
      )}

      {field.type !== "formula" && (
      <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: ".88rem", color: "var(--ink-2)", cursor: "pointer", marginTop: 10 }}>
        <input type="checkbox" checked={field.required} onChange={(e) => patchField({ required: e.target.checked })} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />
        {t("editor.required")}
      </label>
      )}

      {field.type === "formula" && (
        <div style={{ marginTop: 4 }}>
          <label style={lbl}>{t("formula.label")}</label>
          <FormulaInput key={field.id} value={field.formula} onChange={(formula) => patchField({ formula })}
            ctx={{ fields: schema.steps.flatMap((s) => s.fields), selfId: field.id }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
            <label style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{t("formula.decimals")}</label>
            <select value={field.decimals ?? 2} onChange={(e) => patchField({ decimals: Number(e.target.value) })} style={{ ...sel, width: 70, padding: "6px 8px" }}>
              {[0, 1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <Field value={field.unit || ""} onChange={(e) => patchField({ unit: e.target.value })} placeholder={t("editor.unit")} style={{ flex: 1, minWidth: 80 }} />
          </div>
          <label style={lbl}>{t("formula.range")}</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Field type="number" value={field.min ?? ""} onChange={(e) => patchField({ min: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder={t("editor.min")} style={{ width: 90 }} />
            <Field type="number" value={field.max ?? ""} onChange={(e) => patchField({ max: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder={t("editor.max")} style={{ width: 90 }} />
          </div>
          <p style={{ fontSize: ".74rem", color: "var(--ink-3)", margin: "4px 0 0" }}>{t("formula.rangeHint")}</p>
        </div>
      )}

      <label style={lbl}>{t("editor.tooltip")}</label>
      <Field value={field.tooltip || ""} onChange={(e) => patchField({ tooltip: e.target.value })} placeholder={t("editor.tooltip")} />
      {(field.type === "text" || field.type === "number") && (
        <>
          <label style={lbl}>{t("editor.example")}</label>
          <Field value={field.example || ""} onChange={(e) => patchField({ example: e.target.value })} placeholder={field.type === "number" ? t("editor.exampleNumPh") : t("editor.exampleTextPh")} />
        </>
      )}

      {field.type === "number" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
          <label style={{ ...lbl, margin: "6px 0 0" }}>{t("editor.min")}
            <Field type="number" value={field.min ?? ""} onChange={(e) => patchField({ min: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="—" style={{ marginTop: 4 }} />
          </label>
          <label style={{ ...lbl, margin: "6px 0 0" }}>{t("editor.max")}
            <Field type="number" value={field.max ?? ""} onChange={(e) => patchField({ max: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="—" style={{ marginTop: 4 }} />
          </label>
          <label style={{ ...lbl, margin: "6px 0 0" }}>{t("editor.unit")}
            <Field value={field.unit || ""} onChange={(e) => patchField({ unit: e.target.value })} placeholder={t("editor.unitPh")} style={{ marginTop: 4 }} />
          </label>
          <p style={{ gridColumn: "1 / -1", fontSize: ".74rem", color: "var(--ink-3)", margin: 0 }}>{t("editor.rangeHint")}</p>
        </div>
      )}

      {field.type === "datetime" && (
        <>
          <label style={lbl}>{t("editor.dtMode")}</label>
          <select style={sel} value={field.dt_mode ?? "datetime"} onChange={(e) => patchField({ dt_mode: e.target.value === "datetime" ? undefined : (e.target.value as "date" | "time") })}>
            <option value="datetime">{t("editor.dtBoth")}</option>
            <option value="date">{t("editor.dtDate")}</option>
            <option value="time">{t("editor.dtTime")}</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: ".88rem", color: "var(--ink-2)", cursor: "pointer", marginTop: 10 }}>
            <input type="checkbox" checked={!field.dt_no_default} onChange={(e) => patchField({ dt_no_default: e.target.checked ? undefined : true })} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />
            {t("editor.dtDefaultNow")}
          </label>
        </>
      )}

      {field.type === "signature" && (
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: ".88rem", color: "var(--ink-2)", cursor: "pointer", marginTop: 10 }}>
          <input type="checkbox" checked={!!field.sign_name} onChange={(e) => patchField({ sign_name: e.target.checked ? true : undefined })} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />
          {t("editor.signName")}
        </label>
      )}

      {(field.type === "select" || field.type === "checkbox") && (
        <div style={{ marginTop: 8 }}>
          <label style={lbl}>{t("editor.option")}</label>
          <OptionsSourceEditor schema={schema} field={field} onPatch={patchField} staticEditor={
          <div style={{ display: "grid", gap: 6 }}>
            {(field.options || []).map((op, i) => (
              <div key={i} style={{ display: "flex", gap: 6 }}>
                <Field value={op} onChange={(e) => patchField({ options: (field.options || []).map((x, xi) => (xi === i ? e.target.value : x)) })} style={{ flex: 1 }} />
                <button onClick={() => patchField({ options: (field.options || []).filter((_, xi) => xi !== i) })} aria-label={t("common.delete")} title={t("common.delete")} style={{ ...iconBtn, color: "var(--fail)" }}><Icon icon={X} className="h-4 w-4" /></button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(field.options || []).length < 200 && (
                <button onClick={() => patchField({ options: [...(field.options || []), ""] })} style={{ ...iconBtn, color: "var(--accent)", borderColor: "var(--accent)" }}>
                  <Icon icon={Plus} className="h-3.5 w-3.5" /> {t("editor.addOption")}
                </button>
              )}
              <PasteOptions current={field.options || []} onApply={(opts) => patchField({ options: opts })} />
            </div>
            {(field.options || []).length > 8 && <p style={{ fontSize: ".74rem", color: "var(--ink-3)", margin: 0 }}>{t("editor.manyOptionsHint")}</p>}
          </div>
          } />
        </div>
      )}

      {field.type === "photo" && (
        <>
          <label style={lbl}>{t("editor.photoHint")}</label>
          <Field value={field.photo_hint || ""} onChange={(e) => patchField({ photo_hint: e.target.value })} placeholder={t("editor.photoHint")} />
          <div style={{ display: "grid", gridTemplateColumns: field.required ? "1fr 1fr" : "1fr", gap: 8 }}>
            <div>
              <label style={lbl}>{t("editor.maxPhotos")}</label>
              <select value={field.max_photos ?? 1} style={sel}
                onChange={(e) => { const mx = Number(e.target.value); patchField({ max_photos: mx > 1 ? mx : undefined, min_photos: mx > 1 && (field.min_photos ?? 1) > 1 ? Math.min(field.min_photos ?? 1, mx) : undefined }); }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {field.required && (
              <div>
                <label style={lbl}>{t("editor.minPhotos")}</label>
                <select value={Math.min(field.min_photos ?? 1, field.max_photos ?? 1)} style={sel} disabled={(field.max_photos ?? 1) <= 1}
                  onChange={(e) => { const mn = Number(e.target.value); patchField({ min_photos: mn > 1 ? mn : undefined }); }}>
                  {Array.from({ length: field.max_photos ?? 1 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
          </div>
          {(field.max_photos ?? 1) > 1 && <p style={{ fontSize: ".76rem", color: "var(--ink-3)", margin: "6px 0 0" }}>{t("editor.maxPhotosHint")}</p>}
          {/* ชื่อใต้รูปแต่ละช่อง — แยกจากชื่อฟิลด์ (ชื่อฟิลด์ = หัวกล่องรูป) */}
          <label style={lbl}>{t("editor.photoLabels")}</label>
          <div style={{ display: "grid", gap: 6 }}>
            {Array.from({ length: field.max_photos ?? 1 }, (_, i) => {
              const key = i === 0 ? field.id : `${field.id}.ph.slot${String(i).padStart(2, "0")}`;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ flexShrink: 0, minWidth: 24, height: 24, borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700, fontSize: ".78rem", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                  <Field id={`pcap-${key}`} value={field.photo_labels?.[i] ?? ""} placeholder={(field.max_photos ?? 1) > 1 ? tt("print.photos.slotN", { n: i + 1 }) : t("editor.photoLabels")} style={{ flex: 1 }}
                    onChange={(e) => {
                      const n = Array.from({ length: field.max_photos ?? 1 }, (_, j) => field.photo_labels?.[j] ?? "");
                      n[i] = e.target.value;
                      patchField({ photo_labels: n.some((x) => x.trim()) ? n : undefined });
                    }} />
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: ".76rem", color: "var(--ink-3)", margin: "6px 0 0" }}>{t("editor.photoLabelsHint")}</p>
          {/* การพิมพ์รูปเป็นค่าของทั้งฟอร์ม → ตั้งที่หัวเอกสารที่เดียว */}
          <button type="button" data-krok-keep="" onClick={() => onSelect("header")}
            style={{ marginTop: 12, background: "none", border: "none", padding: 0, color: "var(--accent)", fontFamily: "inherit", fontSize: ".82rem", cursor: "pointer", textAlign: "left" }}>
            {t("editor.photoPrintLink")} ›
          </button>
        </>
      )}

      {field.type === "pass_fail" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ ...lbl, margin: "10px 0 0" }}>{t("editor.passLabel")}
              <Field value={field.pass_label ?? ""} onChange={(e) => patchField({ pass_label: e.target.value || undefined })} placeholder={t("fw.pass")} style={{ marginTop: 4 }} />
            </label>
            <label style={{ ...lbl, margin: "10px 0 0" }}>{t("editor.failLabel")}
              <Field value={field.fail_label ?? ""} onChange={(e) => patchField({ fail_label: e.target.value || undefined })} placeholder={t("fw.fail")} style={{ marginTop: 4 }} />
            </label>
          </div>
          <p style={{ fontSize: ".74rem", color: "var(--ink-3)", margin: "4px 0 0" }}>{t("editor.pfLabelHint")}</p>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: ".85rem", color: "var(--ink-2)", cursor: "pointer", marginTop: 10 }}>
            <input type="checkbox" checked={!!field.allow_na} onChange={(e) => patchField({ allow_na: e.target.checked ? true : undefined })} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />
            {t("editor.allowNa")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: ".85rem", color: "var(--ink-2)", cursor: "pointer", marginTop: 10 }}>
            <input type="checkbox" checked={field.on_fail_require_note !== false} onChange={(e) => patchField({ on_fail_require_note: e.target.checked })} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />
            {t("editor.failNote")}
          </label>
        </>
      )}

      {field.type === "table" && (
        <div style={{ marginTop: 10 }}>
          <label style={lbl}>{t("editor.tableCols")}</label>
          <div style={{ display: "grid", gap: 8 }}>
            {cols.map((c, i) => (
              <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {/* ลำดับคอลัมน์ (ซ้าย → ขวา ในตาราง) */}
                  <span aria-label={tt("editor.tableColNo", { n: i + 1 })} title={tt("editor.tableColNo", { n: i + 1 })}
                    style={{ flexShrink: 0, minWidth: 26, height: 26, borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700, fontSize: ".82rem", display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>
                    {i + 1}
                  </span>
                  <Field value={c.label} onChange={(e) => patchCol(i, { label: e.target.value })} placeholder={t("editor.tableColName")} style={{ flex: 1 }} />
                  <button onClick={() => setCols(move(cols, i, -1))} disabled={i === 0} aria-label={t("editor.moveUp")} title={t("editor.colLeft")} style={iconBtn}><Icon icon={ArrowUp} className="h-4 w-4" /></button>
                  <button onClick={() => setCols(move(cols, i, 1))} disabled={i === cols.length - 1} aria-label={t("editor.moveDown")} title={t("editor.colRight")} style={iconBtn}><Icon icon={ArrowDown} className="h-4 w-4" /></button>
                  <button onClick={() => removeCol(i)} disabled={cols.length <= 1} aria-label={t("common.delete")} title={t("common.delete")} style={{ ...iconBtn, color: "var(--fail)" }}><Icon icon={X} className="h-4 w-4" /></button>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <select value={c.type} onChange={(e) => { const ty = e.target.value as TableColType; patchCol(i, ty === "formula" ? { type: ty, decimals: c.decimals ?? 2 } : { type: ty }); }} style={{ ...sel, width: "auto", flex: "0 0 auto" }}>
                    <option value="text">{t("ftype.text")}</option>
                    <option value="number">{t("ftype.number")}</option>
                    <option value="select">{t("editor.tableSelect")}</option>
                    <option value="formula">{t("ftype.formula")}</option>
                    <option value="pass_fail">{t("ftype.pass_fail")}</option>
                    <option value="checkbox">{t("ctype.check")}</option>
                    <option value="datetime">{t("ctype.date")}</option>
                    <option value="scan">{t("ctype.scan")}</option>
                    <option value="photo">{t("ctype.photo")}</option>
                  </select>
                  <label style={{ fontSize: ".78rem", color: "var(--ink-3)" }} title={t("editor.tableWidthHint")}>{t("editor.tableWidth")}</label>
                  <select value={c.width ?? 1} onChange={(e) => patchCol(i, { width: Number(e.target.value) })} title={t("editor.tableWidthHint")} style={{ ...sel, width: "auto", padding: "6px 8px" }}>
                    {[1, 2, 3, 4, 5, 6].map((w) => <option key={w} value={w}>{w}×</option>)}
                  </select>
                  {c.type !== "formula" && (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".8rem", color: "var(--ink-2)", cursor: "pointer" }}>
                      <input type="checkbox" checked={!!c.required} onChange={(e) => patchCol(i, { required: e.target.checked ? true : undefined })} style={{ width: 15, height: 15, accentColor: "var(--accent)" }} />
                      {t("editor.colRequired")}
                    </label>
                  )}
                </div>
                {c.type === "formula" && (
                  <div style={{ marginTop: 8 }}>
                    <FormulaInput key={c.id} value={c.formula} onChange={(formula) => patchCol(i, { formula })} ctx={{ fields: [], rowColumns: cols, selfId: c.id }} />
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                      <label style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{t("formula.decimals")}</label>
                      <select value={c.decimals ?? 2} onChange={(e) => patchCol(i, { decimals: Number(e.target.value) })} style={{ ...sel, width: 64, padding: "5px 8px" }}>
                        {[0, 1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                {c.type === "pass_fail" && <p style={{ fontSize: ".74rem", color: "var(--ink-3)", margin: "6px 0 0" }}>{t("ctype.passFailHint")}</p>}
                {c.type === "scan" && <p style={{ fontSize: ".74rem", color: "var(--ink-3)", margin: "6px 0 0" }}>{t("ctype.scanHint")}</p>}
                {c.type === "photo" && <p style={{ fontSize: ".74rem", color: "var(--ink-3)", margin: "6px 0 0" }}>{t("ctype.photoHint")}</p>}
                {c.type === "select" && (
                  <div style={{ marginTop: 6 }}>
                    <ColumnSourceEditor col={c} onPatch={(p) => patchCol(i, p)} staticEditor={
                      <ColumnOptionsInput options={c.options || []} onChange={(options) => patchCol(i, { options })} placeholder={t("editor.colOptionsPh")} />
                    } />
                  </div>
                )}
              </div>
            ))}
            {cols.length < 12 && (
              <button onClick={addCol} style={{ ...iconBtn, justifySelf: "start", color: "var(--accent)", borderColor: "var(--accent)" }}>
                <Icon icon={Plus} className="h-3.5 w-3.5" /> {t("editor.tableAddCol")}
              </button>
            )}
          </div>
          <p style={{ fontSize: ".74rem", color: "var(--ink-3)", margin: "6px 0 0" }}>{t("editor.tableWidthHint")}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ ...lbl, margin: "10px 0 0" }}>{t("editor.tableMinRows")}
              <input type="number" min={1} max={20} value={field.min_rows ?? 1} onChange={(e) => patchField({ min_rows: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} style={{ ...sel, marginTop: 4 }} />
            </label>
            <label style={{ ...lbl, margin: "10px 0 0" }}>{t("editor.tableMaxRows")}
              <input type="number" min={1} max={500} value={field.max_rows ?? ""} placeholder={t("editor.noLimit")}
                onChange={(e) => { const v = Number(e.target.value); patchField({ max_rows: e.target.value === "" || !v ? undefined : Math.min(500, Math.max(field.min_rows ?? 1, v)) }); }} style={{ ...sel, marginTop: 4 }} />
            </label>
          </div>
        </div>
      )}

      <AttachmentsPanel formId={formId} tenantId={tenantId} fieldId={field.id} compact />

      <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid var(--line)" }}>
        <button style={iconBtn} title={t("editor.moveUp")} disabled={fi === 0} onClick={() => patchStepFields(move(step.fields, fi, -1))}><Icon icon={ArrowUp} className="h-4 w-4" /></button>
        <button style={iconBtn} title={t("editor.moveDown")} disabled={fi === step.fields.length - 1} onClick={() => patchStepFields(move(step.fields, fi, 1))}><Icon icon={ArrowDown} className="h-4 w-4" /></button>
        <button style={iconBtn} title={t("editor.duplicate")} onClick={() => {
          const clone = { ...field, id: newId("f") };
          const fields = [...step.fields]; fields.splice(fi + 1, 0, clone);
          patchStepFields(fields); onSelect(clone.id);
        }}><Icon icon={Copy} className="h-4 w-4" /> {t("editor.duplicate")}</button>
        <button style={{ ...iconBtn, color: "var(--fail)", borderColor: "var(--fail)" }} title={t("editor.deleteField")} onClick={() => {
          patchStepFields(step.fields.filter((_, j) => j !== fi)); onSelect(null);
        }}><Icon icon={Trash2} className="h-4 w-4" /> {t("common.delete")}</button>
      </div>

      <button onClick={() => { const fid = newId("f"); patchStepFields([...step.fields, { id: fid, type: "text", label: "", required: true }]); onSelect(fid); }}
        style={{ ...iconBtn, width: "100%", marginTop: 8, color: "var(--accent)", borderColor: "var(--accent)", justifyContent: "center" }}>
        <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addField")}
      </button>
      <FooterAdd onAddStep={addStep} label={t("editor.addStep")} />
    </Shell>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: ".8rem", fontWeight: 600, color: "var(--ink-2)", margin: "10px 0 5px" };

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <b style={{ fontFamily: "var(--font-anuphan)", fontSize: ".95rem" }}>{title}</b>
        <button onClick={onClose} aria-label={t("common.close")} style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", minWidth: 40, minHeight: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", margin: "-8px -8px -8px 0" }}><Icon icon={X} className="h-5 w-5" /></button>
      </div>
      {children}
    </div>
  );
}

function Empty({ onAddStep }: { onAddStep: () => void }) {
  const { t } = useT();
  return (
    <div style={{ border: "1px dashed var(--line)", borderRadius: 12, padding: 20, textAlign: "center", color: "var(--ink-3)" }}>
      <p style={{ fontSize: ".88rem", margin: "0 0 10px" }}>{t("editor.selectHint")}</p>
      <button onClick={onAddStep} className="inline-flex items-center gap-1.5" style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: ".85rem", fontWeight: 600 }}>
        <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addStep")}
      </button>
    </div>
  );
}

function FooterAdd({ onAddStep, label }: { onAddStep: () => void; label: string }) {
  return (
    <button onClick={onAddStep} className="inline-flex items-center gap-1.5" style={{ width: "100%", justifyContent: "center", marginTop: 8, padding: "9px 14px", borderRadius: 8, border: "1px dashed var(--accent)", background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: ".85rem", fontWeight: 600 }}>
      <Icon icon={Plus} className="h-4 w-4" /> {label}
    </button>
  );
}

/** ตัวเลือกของคอลัมน์ "เลือก" — บรรทัดละ 1 ตัวเลือก (เดิมคั่นด้วยจุลภาค ซึ่งใส่ตัวเลือกที่มีจุลภาคไม่ได้) */
function ColumnOptionsInput({ options, onChange, placeholder }: { options: string[]; onChange: (o: string[]) => void; placeholder: string }) {
  return (
    <textarea rows={Math.min(8, Math.max(3, options.length + 1))} defaultValue={options.join("\n")} placeholder={placeholder}
      onChange={(e) => onChange([...new Set(e.target.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean))].slice(0, 100))}
      style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem", resize: "vertical" }} />
  );
}

/** วางตัวเลือกทีเดียวหลายรายการ (บรรทัดละ 1) — แทนการกดเพิ่มทีละข้อ */
function PasteOptions({ current, onApply }: { current: string[]; onApply: (o: string[]) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => { setTxt(current.filter(Boolean).join("\n")); setOpen(true); }}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 7, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".8rem" }}>
        <Icon icon={ClipboardList} className="h-3.5 w-3.5" /> {t("editor.pasteOptions")}
      </button>
    );
  }
  return (
    <div style={{ width: "100%", display: "grid", gap: 6 }}>
      <textarea autoFocus rows={8} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={t("editor.pasteOptionsMsg")}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--accent)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem", resize: "vertical" }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" onClick={() => { onApply([...new Set(txt.split(/\r?\n/).map((x) => x.trim()).filter(Boolean))].slice(0, 200)); setOpen(false); }}
          style={{ padding: "6px 12px", border: "none", borderRadius: 7, background: "var(--accent)", color: "var(--accent-ink)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600 }}>{t("editor.pasteApply")}</button>
        <button type="button" onClick={() => setOpen(false)}
          style={{ padding: "6px 12px", border: "1px solid var(--line)", borderRadius: 7, background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}
