"use client";
import { useState } from "react";
import { Field } from "@/components/ui";
import Icon from "@/components/Icon";
import { ArrowUp, ArrowDown, Trash2, Settings2, ChevronUp, Plus, X, GripVertical } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  type FieldType,
  type FormField,
  type FormSchema,
  type FormStep,
} from "@/lib/form-schema";

// ตัวช่วย: ย้ายสมาชิกใน array ขึ้น/ลง (คืน array ใหม่)
function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}
// ย้ายจากตำแหน่ง from ไป to (ลากวาง)
function reorder<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

let idc = 0;
const newId = (p: string) => `${p}_${Date.now().toString(36)}${(idc++).toString(36)}`;

export default function FormEditor({
  value,
  onChange,
}: {
  value: FormSchema;
  onChange: (s: FormSchema) => void;
}) {
  const { t } = useT();
  const [openField, setOpenField] = useState<string | null>(null);
  // ลากวางจัดลำดับฟิลด์ (ภายในขั้นตอนเดียวกัน)
  const [drag, setDrag] = useState<{ si: number; fi: number } | null>(null);
  const [dragEnabled, setDragEnabled] = useState<string | null>(null);

  function onFieldDrop(si: number, targetFi: number) {
    if (!drag || drag.si !== si || drag.fi === targetFi) { setDrag(null); setDragEnabled(null); return; }
    patchStep(si, { fields: reorder(value.steps[si].fields, drag.fi, targetFi) });
    setDrag(null);
    setDragEnabled(null);
  }

  function patch(p: Partial<FormSchema>) {
    onChange({ ...value, ...p });
  }
  function setSteps(steps: FormStep[]) {
    onChange({ ...value, steps });
  }
  function patchStep(si: number, p: Partial<FormStep>) {
    setSteps(value.steps.map((s, i) => (i === si ? { ...s, ...p } : s)));
  }
  function patchField(si: number, fi: number, p: Partial<FormField>) {
    patchStep(si, {
      fields: value.steps[si].fields.map((f, i) => (i === fi ? { ...f, ...p } : f)),
    });
  }

  const iconBtn: React.CSSProperties = {
    width: 30, height: 30, borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)",
    color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", padding: 0, lineHeight: 1,
    display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto",
  };
  const sel: React.CSSProperties = {
    padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)",
    color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem",
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* หัวฟอร์ม */}
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "56px 1fr", alignItems: "start" }}>
        <input
          value={value.icon}
          onChange={(e) => patch({ icon: e.target.value.slice(0, 4) })}
          style={{ ...sel, textAlign: "center", fontSize: "1.3rem", padding: "8px 4px" }}
          aria-label="icon"
        />
        <div style={{ display: "grid", gap: 8 }}>
          <Field value={value.title} onChange={(e) => patch({ title: e.target.value })} placeholder={t("editor.formTitle")} />
          <Field value={value.description} onChange={(e) => patch({ description: e.target.value })} placeholder={t("editor.formDesc")} />
        </div>
      </div>

      {/* ขั้นตอน */}
      {value.steps.map((step, si) => (
        <div key={step.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--surface-2)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontFamily: "monospace", fontSize: ".7rem", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 5, padding: "3px 7px", flex: "0 0 auto" }}>
              {t("editor.step")} {si + 1}
            </span>
            <Field value={step.title} onChange={(e) => patchStep(si, { title: e.target.value })} style={{ flex: 1 }} placeholder={t("editor.stepTitle")} />
            <button style={iconBtn} title={t("editor.moveUp")} disabled={si === 0} onClick={() => setSteps(move(value.steps, si, -1))}><Icon icon={ArrowUp} className="h-4 w-4" /></button>
            <button style={iconBtn} title={t("editor.moveDown")} disabled={si === value.steps.length - 1} onClick={() => setSteps(move(value.steps, si, 1))}><Icon icon={ArrowDown} className="h-4 w-4" /></button>
            <button
              style={{ ...iconBtn, color: "var(--fail)" }}
              title={t("editor.deleteStep")}
              onClick={() => {
                if (value.steps.length <= 1) { alert(t("editor.needOneStep")); return; }
                if (!confirm(t("editor.deleteStepConfirm"))) return;
                setSteps(value.steps.filter((_, i) => i !== si));
              }}
            >
              <Icon icon={Trash2} className="h-4 w-4" />
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {step.fields.map((field, fi) => {
              const isOpen = openField === field.id;
              const isDragging = drag?.si === si && drag?.fi === fi;
              return (
                <div
                  key={field.id}
                  draggable={dragEnabled === field.id}
                  onDragStart={() => setDrag({ si, fi })}
                  onDragEnd={() => { setDrag(null); setDragEnabled(null); }}
                  onDragOver={(e) => { if (drag && drag.si === si) e.preventDefault(); }}
                  onDrop={() => onFieldDrop(si, fi)}
                  style={{
                    border: isDragging ? "1px solid var(--accent)" : "1px solid var(--line)",
                    borderRadius: 9, background: "var(--surface)", padding: 10,
                    opacity: isDragging ? 0.5 : 1,
                    boxShadow: drag && drag.si === si && !isDragging ? "inset 0 0 0 1px var(--accent-soft)" : "none",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span
                      title={t("editor.dragReorder")}
                      onMouseDown={() => setDragEnabled(field.id)}
                      onMouseUp={() => setDragEnabled(null)}
                      onTouchStart={() => setDragEnabled(field.id)}
                      style={{ ...iconBtn, cursor: "grab", color: "var(--ink-3)", touchAction: "none" }}
                    >
                      <Icon icon={GripVertical} className="h-4 w-4" />
                    </span>
                    <Field value={field.label} onChange={(e) => patchField(si, fi, { label: e.target.value })} placeholder={t("editor.fieldLabel")} style={{ flex: 1, minWidth: 140 }} />
                    <select value={field.type} onChange={(e) => patchField(si, fi, { type: e.target.value as FieldType })} style={sel}>
                      {FIELD_TYPES.map((ft) => (
                        <option key={ft} value={ft}>{FIELD_TYPE_LABELS[ft]}</option>
                      ))}
                    </select>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: ".82rem", color: "var(--ink-2)", cursor: "pointer" }}>
                      <input type="checkbox" checked={field.required} onChange={(e) => patchField(si, fi, { required: e.target.checked })} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
                      {t("editor.required")}
                    </label>
                    <button style={iconBtn} title={t("editor.more")} onClick={() => setOpenField(isOpen ? null : field.id)}><Icon icon={isOpen ? ChevronUp : Settings2} className="h-4 w-4" /></button>
                    <button style={iconBtn} title={t("editor.moveUp")} disabled={fi === 0} onClick={() => patchStep(si, { fields: move(step.fields, fi, -1) })}><Icon icon={ArrowUp} className="h-4 w-4" /></button>
                    <button style={iconBtn} title={t("editor.moveDown")} disabled={fi === step.fields.length - 1} onClick={() => patchStep(si, { fields: move(step.fields, fi, 1) })}><Icon icon={ArrowDown} className="h-4 w-4" /></button>
                    <button style={{ ...iconBtn, color: "var(--fail)" }} title={t("editor.deleteField")} onClick={() => patchStep(si, { fields: step.fields.filter((_, i) => i !== fi) })}><Icon icon={Trash2} className="h-4 w-4" /></button>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--line)", display: "grid", gap: 8 }}>
                      <Field value={field.tooltip || ""} onChange={(e) => patchField(si, fi, { tooltip: e.target.value })} placeholder={t("editor.tooltip")} />
                      <Field value={field.example || ""} onChange={(e) => patchField(si, fi, { example: e.target.value })} placeholder={t("editor.example")} />

                      {field.type === "number" && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Field type="number" value={field.min ?? ""} onChange={(e) => patchField(si, fi, { min: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder={t("editor.min")} style={{ width: 100 }} />
                          <Field type="number" value={field.max ?? ""} onChange={(e) => patchField(si, fi, { max: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder={t("editor.max")} style={{ width: 100 }} />
                          <Field value={field.unit || ""} onChange={(e) => patchField(si, fi, { unit: e.target.value })} placeholder={t("editor.unit")} style={{ width: 120 }} />
                        </div>
                      )}

                      {(field.type === "select" || field.type === "checkbox") && (
                        <OptionsEditor
                          options={field.options || []}
                          onChange={(options) => patchField(si, fi, { options })}
                          addLabel={t("editor.addOption")}
                          placeholder={t("editor.option")}
                        />
                      )}

                      {field.type === "photo" && (
                        <Field value={field.photo_hint || ""} onChange={(e) => patchField(si, fi, { photo_hint: e.target.value })} placeholder={t("editor.photoHint")} />
                      )}

                      {field.type === "pass_fail" && (
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".85rem", color: "var(--ink-2)", cursor: "pointer" }}>
                          <input type="checkbox" checked={field.on_fail_require_note !== false} onChange={(e) => patchField(si, fi, { on_fail_require_note: e.target.checked })} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
                          {t("editor.failNote")}
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={() =>
                patchStep(si, {
                  fields: [...step.fields, { id: newId("f"), type: "text", label: "", required: true }],
                })
              }
              className="inline-flex items-center gap-1.5"
              style={{ ...iconBtn, width: "auto", padding: "8px 14px", color: "var(--accent)", borderColor: "var(--accent)", fontSize: ".85rem", fontWeight: 600 }}
            >
              <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addField")}
            </button>
          </div>
        </div>
      ))}

      <button
        onClick={() => setSteps([...value.steps, { id: newId("s"), title: "", fields: [{ id: newId("f"), type: "text", label: "", required: true }] }])}
        className="inline-flex items-center gap-1.5"
        style={{ padding: "10px 16px", borderRadius: 9, border: "1px dashed var(--accent)", background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: ".9rem" }}
      >
        <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addStep")}
      </button>
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
  addLabel,
  placeholder,
}: {
  options: string[];
  onChange: (o: string[]) => void;
  addLabel: string;
  placeholder: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {options.map((op, i) => (
        <div key={i} style={{ display: "flex", gap: 6 }}>
          <Field value={op} onChange={(e) => onChange(options.map((x, xi) => (xi === i ? e.target.value : x)))} placeholder={placeholder} style={{ flex: 1 }} />
          <button
            onClick={() => onChange(options.filter((_, xi) => xi !== i))}
            className="inline-flex items-center justify-center"
            style={{ width: 34, borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--fail)", cursor: "pointer" }}
          >
            <Icon icon={X} className="h-4 w-4" />
          </button>
        </div>
      ))}
      {options.length < 12 && (
        <button
          onClick={() => onChange([...options, ""])}
          className="inline-flex items-center gap-1.5"
          style={{ justifySelf: "start", padding: "6px 12px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem" }}
        >
          <Icon icon={Plus} className="h-3.5 w-3.5" /> {addLabel}
        </button>
      )}
    </div>
  );
}
