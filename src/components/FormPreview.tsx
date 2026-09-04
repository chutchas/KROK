"use client";
import { Lightbulb, Lock } from "lucide-react";
import Icon from "@/components/Icon";
import { FIELD_TYPE_LABELS, type FormField, type FormSchema } from "@/lib/form-schema";

function FieldCard({ f }: { f: FormField }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, margin: "10px 0", background: "var(--surface)" }}>
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
          {FIELD_TYPE_LABELS[f.type]}
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
          ตัวอย่าง: <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{f.example}</code>
        </div>
      )}
      {f.type === "number" && (f.min != null || f.max != null) && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
          ช่วงที่ยอมรับ: <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{f.min ?? "–"} ถึง {f.max ?? "–"} {f.unit || ""}</code>
        </div>
      )}
      {f.options && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
          ตัวเลือก: {f.options.map((o, i) => (
            <code key={i} style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4, marginRight: 5 }}>{o}</code>
          ))}
        </div>
      )}
      {f.photo_hint && (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)", marginTop: 4 }}>
          รูปต้องเห็น: <code style={{ background: "var(--code-bg)", padding: "1px 6px", borderRadius: 4 }}>{f.photo_hint}</code>
        </div>
      )}
    </div>
  );
}

export default function FormPreview({ schema }: { schema: FormSchema }) {
  return (
    <div>
      {schema.steps.map((s, i) => (
        <div key={s.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 8px" }}>
            <span style={{ fontFamily: "monospace", fontSize: ".72rem", background: "var(--code-bg)", border: "1px solid var(--line)", borderRadius: 5, padding: "2px 8px", color: "var(--ink-2)" }}>
              STEP {i + 1}/{schema.steps.length}
            </span>
            <h3 style={{ fontSize: "1.05rem" }}>{s.title}</h3>
          </div>
          {s.fields.map((f) => (
            <FieldCard key={f.id} f={f} />
          ))}
        </div>
      ))}
      <div style={{ fontSize: ".78rem", color: "var(--ink-3)", display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
        <Icon icon={Lock} className="h-3.5 w-3.5" /> โหมดกรอกจริงจะล็อคลำดับ — ต้องทำ step ก่อนหน้าให้ครบจึงไปต่อได้
      </div>
    </div>
  );
}
