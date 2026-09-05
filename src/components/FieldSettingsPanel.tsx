"use client";
import { Field } from "@/components/ui";
import Icon from "@/components/Icon";
import { ArrowUp, ArrowDown, Trash2, Copy, Plus, X } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  type FieldType,
  type FormField,
  type FormSchema,
} from "@/lib/form-schema";

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
}: {
  schema: FormSchema;
  selectedKey: string | null;
  onChange: (s: FormSchema) => void;
  onSelect: (key: string | null) => void;
}) {
  const { t } = useT();

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
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <button style={iconBtn} disabled={si === 0} onClick={() => setSteps(move(schema.steps, si, -1))}><Icon icon={ArrowUp} className="h-4 w-4" /></button>
          <button style={iconBtn} disabled={si === schema.steps.length - 1} onClick={() => setSteps(move(schema.steps, si, 1))}><Icon icon={ArrowDown} className="h-4 w-4" /></button>
          <button style={iconBtn} onClick={() => { const fid = newId("f"); patchStep({ fields: [...step.fields, { id: fid, type: "text", label: "", required: true }] }); onSelect(fid); }}>
            <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addField")}
          </button>
          <button style={{ ...iconBtn, color: "var(--fail)", borderColor: "var(--fail)" }} onClick={() => {
            if (schema.steps.length <= 1) { alert(t("editor.needOneStep")); return; }
            if (!confirm(t("editor.deleteStepConfirm"))) return;
            setSteps(schema.steps.filter((_, i) => i !== si));
            onSelect(null);
          }}><Icon icon={Trash2} className="h-4 w-4" /> {t("editor.deleteStep")}</button>
        </div>
        <FooterAdd onAddStep={addStep} label={t("editor.addStep")} />
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

  return (
    <Shell title={t("editor.fieldSettings")} onClose={() => onSelect(null)}>
      <label style={lbl}>{t("editor.fieldLabel")}</label>
      <Field value={field.label} onChange={(e) => patchField({ label: e.target.value })} placeholder={t("editor.fieldLabel")} />

      <label style={lbl}>{t("editor.fieldType")}</label>
      <select value={field.type} onChange={(e) => patchField({ type: e.target.value as FieldType })} style={sel}>
        {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{FIELD_TYPE_LABELS[ft]}</option>)}
      </select>

      <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: ".88rem", color: "var(--ink-2)", cursor: "pointer", marginTop: 10 }}>
        <input type="checkbox" checked={field.required} onChange={(e) => patchField({ required: e.target.checked })} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />
        {t("editor.required")}
      </label>

      <label style={lbl}>{t("editor.tooltip")}</label>
      <Field value={field.tooltip || ""} onChange={(e) => patchField({ tooltip: e.target.value })} placeholder={t("editor.tooltip")} />
      <label style={lbl}>{t("editor.example")}</label>
      <Field value={field.example || ""} onChange={(e) => patchField({ example: e.target.value })} placeholder={t("editor.example")} />

      {field.type === "number" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <Field type="number" value={field.min ?? ""} onChange={(e) => patchField({ min: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder={t("editor.min")} style={{ width: 90 }} />
          <Field type="number" value={field.max ?? ""} onChange={(e) => patchField({ max: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder={t("editor.max")} style={{ width: 90 }} />
          <Field value={field.unit || ""} onChange={(e) => patchField({ unit: e.target.value })} placeholder={t("editor.unit")} style={{ flex: 1, minWidth: 80 }} />
        </div>
      )}

      {(field.type === "select" || field.type === "checkbox") && (
        <div style={{ marginTop: 8 }}>
          <label style={lbl}>{t("editor.option")}</label>
          <div style={{ display: "grid", gap: 6 }}>
            {(field.options || []).map((op, i) => (
              <div key={i} style={{ display: "flex", gap: 6 }}>
                <Field value={op} onChange={(e) => patchField({ options: (field.options || []).map((x, xi) => (xi === i ? e.target.value : x)) })} style={{ flex: 1 }} />
                <button onClick={() => patchField({ options: (field.options || []).filter((_, xi) => xi !== i) })} style={{ ...iconBtn, color: "var(--fail)" }}><Icon icon={X} className="h-4 w-4" /></button>
              </div>
            ))}
            {(field.options || []).length < 12 && (
              <button onClick={() => patchField({ options: [...(field.options || []), ""] })} style={{ ...iconBtn, justifySelf: "start", color: "var(--accent)", borderColor: "var(--accent)" }}>
                <Icon icon={Plus} className="h-3.5 w-3.5" /> {t("editor.addOption")}
              </button>
            )}
          </div>
        </div>
      )}

      {field.type === "photo" && (
        <>
          <label style={lbl}>{t("editor.photoHint")}</label>
          <Field value={field.photo_hint || ""} onChange={(e) => patchField({ photo_hint: e.target.value })} placeholder={t("editor.photoHint")} />
        </>
      )}

      {field.type === "pass_fail" && (
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: ".85rem", color: "var(--ink-2)", cursor: "pointer", marginTop: 10 }}>
          <input type="checkbox" checked={field.on_fail_require_note !== false} onChange={(e) => patchField({ on_fail_require_note: e.target.checked })} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} />
          {t("editor.failNote")}
        </label>
      )}

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
        <button onClick={onClose} aria-label={t("common.close")} style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer" }}><Icon icon={X} className="h-4 w-4" /></button>
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
