"use client";
import { FIELD_TYPE_LABELS, type FormField, type FormSchema } from "@/lib/form-schema";

// มุมมอง "กระดาษจริง" — ฟอร์มเปล่าแบบเอกสาร A4 สำหรับพิมพ์/ตรวจทาน
function Blank({ f }: { f: FormField }) {
  if (f.type === "pass_fail") {
    return (
      <span style={{ display: "inline-flex", gap: 14, fontSize: ".82rem" }}>
        <span>☐ ผ่าน</span>
        <span>☐ ไม่ผ่าน</span>
      </span>
    );
  }
  if (f.type === "checkbox" || f.type === "select") {
    return (
      <span style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: ".82rem" }}>
        {(f.options || []).map((o, i) => (
          <span key={i}>☐ {o}</span>
        ))}
        {(!f.options || f.options.length === 0) && <span style={{ borderBottom: "1px dotted #999", flex: 1, minHeight: 18 }} />}
      </span>
    );
  }
  if (f.type === "signature") {
    return <span style={{ display: "block", borderBottom: "1px solid #333", height: 40 }} />;
  }
  if (f.type === "photo") {
    return <span style={{ display: "block", border: "1px dashed #999", height: 64, borderRadius: 4 }} />;
  }
  // text / number / barcode / datetime
  return <span style={{ display: "block", borderBottom: "1px dotted #999", minHeight: 20 }} />;
}

export default function FormPaperView({ schema }: { schema: FormSchema }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
      <div
        className="krok-paper"
        style={{
          width: "100%",
          maxWidth: 720,
          background: "#fff",
          color: "#111",
          border: "1px solid var(--line)",
          borderRadius: 6,
          boxShadow: "var(--shadow)",
          padding: "32px 34px",
          fontSize: ".9rem",
          lineHeight: 1.5,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 10, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{schema.icon} {schema.title}</div>
            {schema.description && <div style={{ color: "#555", fontSize: ".82rem" }}>{schema.description}</div>}
          </div>
          <div style={{ fontSize: ".78rem", color: "#555", textAlign: "right" }}>
            วันที่: ______________<br />เลขที่: ______________
          </div>
        </div>

        {schema.steps.map((s, si) => (
          <div key={s.id} style={{ marginBottom: 18, breakInside: "avoid" }}>
            <div style={{ fontWeight: 700, background: "#f0f0f0", padding: "4px 8px", borderRadius: 3, marginBottom: 8 }}>
              {si + 1}. {s.title}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {s.fields.map((f) => (
                  <tr key={f.id} style={{ borderBottom: "1px solid #e5e5e5" }}>
                    <td style={{ width: "42%", verticalAlign: "top", padding: "8px 8px 8px 0", color: "#222" }}>
                      {f.label}{f.required && <span style={{ color: "#c00" }}> *</span>}
                      <span style={{ display: "block", fontSize: ".68rem", color: "#888" }}>{FIELD_TYPE_LABELS[f.type]}{f.unit ? ` (${f.unit})` : ""}</span>
                    </td>
                    <td style={{ verticalAlign: "middle", padding: "8px 0" }}>
                      <Blank f={f} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28, fontSize: ".82rem", color: "#333" }}>
          <div>ผู้ตรวจ: ______________________<br /><span style={{ fontSize: ".72rem", color: "#888" }}>ลงชื่อ / วันที่</span></div>
          <div>ผู้อนุมัติ: ______________________<br /><span style={{ fontSize: ".72rem", color: "#888" }}>ลงชื่อ / วันที่</span></div>
        </div>
      </div>
    </div>
  );
}
