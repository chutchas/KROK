"use client";
import { Lightbulb, Lock, Plus } from "lucide-react";
import Icon from "@/components/Icon";
import FormIcon from "@/components/FormIcon";
import { useT } from "@/i18n/LanguageProvider";
import { type FormField, type FormSchema } from "@/lib/form-schema";
import { toDisplay } from "@/lib/formula";

function FieldCard({ f, selected, onSelect, schemaFields = [] }: { f: FormField; selected?: boolean; onSelect?: () => void; schemaFields?: FormField[] }) {
  const { t, tt } = useT();
  return (
    <div
      data-krok-keep=""
      onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(); } : undefined}
      style={{
        border: selected ? "1.5px solid var(--accent)" : "1px solid var(--line)",
        borderRadius: 10, padding: 14, margin: "10px 0",
        background: selected ? "var(--accent-soft)" : "var(--surface)",
        cursor: onSelect ? "pointer" : "default",
        boxShadow: selected ? "0 2px 10px rgba(0,0,0,.08)" : "none",
      }}
    >
      <div style={{ fontWeight: 600, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
        {f.label}
        {f.required && <span style={{ color: "var(--fail)", fontWeight: 700 }}>*</span>}
        <span
          style={{
            fontFamily: "monospace",
            fontSize: ".65rem",
            color: "var(--ink-3)",
            border: "1px solid var(--line)",
            borderRadius: 4,
            padding: "1px 6px",
            marginLeft: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {t(`ftype.${f.type}`)}
        </span>
      </div>
      {f.tooltip && (
        <div style={{ fontSize: ".83rem", color: "var(--ink-2)", background: "var(--code-bg)", borderRadius: 7, padding: "7px 11px", margin: "8px 0 4px", display: "flex", gap: 7, alignItems: "flex-start" }}>
          <span aria-hidden style={{ color: "var(--amber)", marginTop: 1 }}><Icon icon={Lightbulb} className="h-4 w-4" /></span>
          <span>{f.tooltip}</span>
        </div>
      )}
      {f.example && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
          {t("fw.prev.example")} <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{f.example}</code>
        </div>
      )}
      {f.type === "formula" && f.formula && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
          ƒ <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{toDisplay(f.formula, { fields: schemaFields })}</code>
        </div>
      )}
      {(f.type === "number" || f.type === "formula") && (f.min != null || f.max != null) && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
          {t("fw.rangeLabel")} <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{tt("fw.rangeVal", { min: f.min ?? "–", max: f.max ?? "–" })} {f.unit || ""}</code>
        </div>
      )}
      {f.options_source && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
          {t("fw.prev.options")} <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{t("fw.prev.fromDataset")} · {f.options_source.label_column ? tt("fw.prev.stores", { label: f.options_source.label_column, col: f.options_source.column }) : f.options_source.column}{f.options_source.parent ? t("fw.prev.filtered") : ""}</code>
        </div>
      )}
      {f.options && !f.options_source && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
          {t("fw.prev.options")} {f.options.map((o, i) => (
            <code key={i} style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4, marginRight: 5 }}>{o}</code>
          ))}
        </div>
      )}
      {f.photo_hint && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
          {t("fw.photoMustShow")} <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{f.photo_hint}</code>
        </div>
      )}
    </div>
  );
}

export default function FormPreview({
  schema,
  selectedKey,
  onSelect,
  onAddField,
  onAddStep,
}: {
  schema: FormSchema;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  onAddField?: (stepIndex: number) => void;
  onAddStep?: () => void;
}) {
  const { t } = useT();
  const editable = !!onSelect;
  const allFields = schema.steps.flatMap((st) => st.fields);
  const addBtn: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%",
    padding: "9px 12px", margin: "6px 0 2px", borderRadius: 9, border: "1px dashed var(--accent)",
    background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit",
    fontSize: ".84rem", fontWeight: 600,
  };
  return (
    <div>
      {/* หัวฟอร์ม: ชื่อ + คำอธิบาย (เหมือนมุมมองกระดาษ) — แก้ได้ที่การ์ดด้านบน */}
      {(schema.title || schema.description) && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 2px 12px", borderBottom: "1px solid var(--line)" }}>
          <FormIcon value={schema.icon} size={34} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "1.08rem", fontWeight: 700, lineHeight: 1.35, color: "var(--ink)", overflowWrap: "anywhere" }}>{schema.title}</div>
            {schema.description && (
              <div style={{ fontSize: ".82rem", color: "var(--ink-2)", marginTop: 2, lineHeight: 1.45, overflowWrap: "anywhere" }}>{schema.description}</div>
            )}
          </div>
        </div>
      )}
      {schema.steps.map((s, i) => {
        const stepKey = `s:${s.id}`;
        const stepSel = selectedKey === stepKey;
        return (
          <div key={s.id}>
            <div
              data-krok-keep=""
              onClick={editable ? (e) => { e.stopPropagation(); onSelect!(stepKey); } : undefined}
              style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 8px", padding: editable ? "4px 6px" : 0, borderRadius: 8, cursor: editable ? "pointer" : "default", background: stepSel ? "var(--accent-soft)" : "transparent" }}
            >
              <span style={{ fontFamily: "monospace", fontSize: ".72rem", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 8px", color: "var(--ink-2)" }}>
                STEP {i + 1}/{schema.steps.length}
              </span>
              <h3 style={{ fontSize: "1.05rem", color: stepSel ? "var(--accent)" : "var(--ink)" }}>{s.title}</h3>
            </div>
            {s.fields.map((f) => (
              <FieldCard key={f.id} f={f} schemaFields={allFields} selected={selectedKey === f.id} onSelect={editable ? () => onSelect!(f.id) : undefined} />
            ))}
            {editable && onAddField && (
              <button data-krok-keep="" onClick={(e) => { e.stopPropagation(); onAddField(i); }} style={addBtn}>
                <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addField")}
              </button>
            )}
          </div>
        );
      })}
      {editable && onAddStep && (
        <button data-krok-keep="" onClick={(e) => { e.stopPropagation(); onAddStep(); }} style={{ ...addBtn, marginTop: 14, borderStyle: "solid" }}>
          <Icon icon={Plus} className="h-4 w-4" /> {t("editor.addStep")}
        </button>
      )}
      {!editable && (
        <div style={{ fontSize: ".78rem", color: "var(--ink-3)", display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
          <Icon icon={Lock} className="h-3.5 w-3.5" /> {t("fw.prev.lockHint")}
        </div>
      )}
    </div>
  );
}
