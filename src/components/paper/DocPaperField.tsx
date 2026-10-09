"use client";
// ============================================================
// ช่องบน "เอกสาร A4" ของใบที่ส่งแล้ว — อ่านอย่างเดียว
// ใช้ชิ้นส่วนกระดาษชุดเดียวกับหน้ากรอกแบบกระดาษ (PaperParts) → หน้าตา/ขนาดตรงกับตอนกรอก
// ค่าที่แสดงมาจากคำตอบที่บันทึกไว้ (display/code/rows) ไม่ใช่ค่าดิบตอนกรอก
// ============================================================
import { TriangleAlert } from "lucide-react";
import Icon from "@/components/Icon";
import type { FormField, TableColumn } from "@/lib/form-schema";
import type { StoredAnswer } from "@/lib/doc-answers";
import { pfCodeOf } from "@/lib/field-display";
import { answerPhotoKeys } from "@/lib/photo-slots";
import { cellFails } from "@/lib/table-rows";
import { CONTROL_H, TABLE_ROW_H } from "@/lib/paper-layout";
import { useT } from "@/i18n/LanguageProvider";
import { INK, LINE, MUTED, PaperChoices, PaperLabel, PaperPassFail, PaperSignature, PaperTable } from "@/components/paper/PaperParts";

const FAIL = "#b91c1c";
/** ตัวเลือกไม่เกินนี้ = วาดเป็นวงกลม/ช่องติ๊กให้เห็นทุกข้อเหมือนกระดาษ · มากกว่า = แสดงเฉพาะที่เลือก */
const MAX_CHOICES = 8;

/** ค่าที่กรอก: ตัวอักษรบนเส้น (แบบเดียวกับตอนพิมพ์จากหน้ากรอก) — ขึ้นบรรทัดใหม่ได้ ไม่ตัดข้อความ */
function ValueLine({ text, fail, align, mono }: { text?: string; fail?: boolean; align?: "right"; mono?: string }) {
  const empty = !text || text === "—";
  return (
    <div style={{ minHeight: CONTROL_H, boxSizing: "border-box", padding: "4px 2px 3px", borderBottom: "1px solid #9ca3af", fontSize: ".8rem", lineHeight: 1.35, color: fail ? FAIL : INK, fontWeight: fail ? 700 : 400, whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: align }}>
      {empty ? "" : text}
      {mono && <span style={{ marginLeft: 6, fontFamily: "monospace", fontSize: ".7rem", color: MUTED, fontWeight: 400 }}>{mono}</span>}
    </div>
  );
}

function FailNote({ text }: { text?: string }) {
  if (!text?.trim()) return null;
  return (
    <div style={{ marginTop: 3, display: "flex", gap: 4, alignItems: "flex-start", fontSize: ".72rem", color: FAIL, lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      <Icon icon={TriangleAlert} className="h-3 w-3" /> <span>{text}</span>
    </div>
  );
}

function TableValue({ col, row, photoUrl }: { col: TableColumn; row: Record<string, string>; photoUrl: (k: string) => string | undefined }) {
  const { t } = useT();
  const v = row[col.id] ?? "";
  const cell: React.CSSProperties = { minHeight: TABLE_ROW_H - 1, boxSizing: "border-box", padding: "3px 5px", fontSize: ".76rem", lineHeight: 1.3, color: INK, overflowWrap: "anywhere", display: "flex", alignItems: "center" };
  if (col.type === "photo") {
    const k = row[`${col.id}#photo`];
    const u = k ? photoUrl(k) : undefined;
    return <div style={{ ...cell, justifyContent: "center", padding: 2 }}>{u ? <img src={u} alt={col.label} style={{ height: 44, maxWidth: "100%", objectFit: "cover", borderRadius: 2, display: "block" }} /> : null}</div>;
  }
  if (col.type === "pass_fail") {
    if (!v) return <div style={cell} />;
    const fail = v === "fail";
    return <div style={{ ...cell, justifyContent: "center", fontWeight: 700, color: fail ? FAIL : v === "pass" ? "#166534" : "#444" }}>{fail ? `✕ ${t("fw.fail")}` : v === "pass" ? `✓ ${t("fw.pass")}` : t("fw.na")}</div>;
  }
  if (col.type === "checkbox") return <div style={{ ...cell, justifyContent: "center", fontWeight: 700 }}>{v === "1" ? "✓" : ""}</div>;
  const fail = cellFails(col, v);
  return <div style={{ ...cell, justifyContent: col.type === "formula" || col.type === "number" ? "flex-end" : undefined, color: fail ? FAIL : INK, fontWeight: fail ? 700 : 400, whiteSpace: "pre-wrap" }}>{v}</div>;
}

export default function DocPaperField({ f, a, photoUrl }: { f: FormField; a?: StoredAnswer; photoUrl: (key: string) => string | undefined }) {
  const display = a?.display && a.display !== "—" ? a.display : "";
  const label = f.type === "table" ? null : (
    <PaperLabel label={f.label} required={f.required}
      right={(f.type === "number" || f.type === "formula") && f.unit ? <span style={{ fontSize: ".72rem", color: MUTED, fontWeight: 400 }}>{f.unit}</span> : undefined} />
  );

  switch (f.type) {
    case "child_form":
      return null;
    case "pass_fail": {
      const code = a?.fail ? "fail" : pfCodeOf(f, display);
      return (
        <div>
          {label}
          <PaperPassFail value={code || undefined} disabled passLabel={f.pass_label} failLabel={f.fail_label} allowNa={!!f.allow_na} />
          {code === "fail" && <FailNote text={a?.note} />}
        </div>
      );
    }
    case "select":
    case "checkbox": {
      const opts = f.options || [];
      if (!f.options_source && opts.length > 0 && opts.length <= MAX_CHOICES) {
        const parts = new Set([...(display ? (f.type === "checkbox" ? display.split(/,\s*/) : [display]) : []), ...(a?.code ? a.code.split(/,\s*/) : [])]);
        const sel = opts.filter((o) => parts.has(o) || display === o);
        return (
          <div>
            {label}
            {/* ไม่ใช้ disabled (เบราว์เซอร์วาดเป็นสีเทาจาง อ่านยากบนกระดาษ) — กันการคลิกด้วย pointer-events แทน */}
            <div aria-readonly style={{ pointerEvents: "none" }}>
              <PaperChoices name={`doc_${f.id}`} options={opts} multiple={f.type === "checkbox"} value={f.type === "checkbox" ? sel : sel[0] ?? ""} />
            </div>
            {f.type === "checkbox" && <FailNote text={a?.note} />}
          </div>
        );
      }
      return <div>{label}<ValueLine text={display} fail={a?.fail} mono={a?.code && a.code !== display ? a.code : undefined} />{f.type === "checkbox" && <FailNote text={a?.note} />}</div>;
    }
    case "photo": {
      const urls = a ? answerPhotoKeys(a).map((k, i) => ({ k, u: photoUrl(k), cap: a.photoLabels?.[i]?.trim() })).filter((x) => x.u) : [];
      return (
        <div>
          {label}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minHeight: CONTROL_H }}>
            {urls.map(({ k, u, cap }) => (
              <figure key={k} style={{ margin: 0 }}>
                <img src={u} alt={cap || f.label} style={{ height: 64, maxWidth: 140, objectFit: "cover", borderRadius: 3, border: `1px solid ${LINE}`, display: "block" }} />
                {cap && <figcaption style={{ fontSize: ".64rem", color: MUTED, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cap}</figcaption>}
              </figure>
            ))}
          </div>
        </div>
      );
    }
    case "signature": {
      const url = a?.photoField ? photoUrl(a.photoField) : undefined;
      // "เซ็นแล้ว — ชื่อผู้เซ็น"
      const name = display.includes("—") ? display.split("—").slice(1).join("—").trim() : "";
      return (
        <div>
          {label}
          <PaperSignature url={url} disabled />
          {f.sign_name && <div style={{ marginTop: 3, fontSize: ".78rem", textAlign: "center", color: INK }}>{name ? `( ${name} )` : ""}</div>}
        </div>
      );
    }
    case "table": {
      const cols = (f.columns && f.columns.length ? f.columns : (a?.columns as TableColumn[] | undefined)) || [];
      const rows = a?.rows || [];
      return (
        <div>
          <PaperLabel label={f.label} required={f.required} />
          <PaperTable columns={cols} rows={rows} disabled renderCell={(ri, c) => <TableValue col={c} row={rows[ri]} photoUrl={photoUrl} />} />
        </div>
      );
    }
    case "formula":
    case "number": {
      // หน่วยอยู่ที่บรรทัดชื่อช่องแล้ว (เหมือนตอนกรอก) — ตัดหน่วยท้ายค่าที่บันทึกไว้ออก
      const v = f.unit && display.endsWith(` ${f.unit}`) ? display.slice(0, -f.unit.length - 1) : display;
      return <div>{label}<ValueLine text={v} fail={a?.fail} align="right" /></div>;
    }
    default:
      return <div>{label}<ValueLine text={display} fail={a?.fail} mono={a?.code && a.code !== display ? a.code : undefined} /></div>;
  }
}
