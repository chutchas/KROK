"use client";
// ============================================================
// ชิ้นส่วน "กระดาษ" ที่ใช้ร่วมกันระหว่าง Editor (มุมมองกระดาษ) และหน้ากรอก (มุมมองกระดาษ)
// ใช้ชิ้นเดียวกันทั้งสองที่ → ขนาด/ระยะ/หน้าตาตรงกัน (Editor ส่ง disabled มาเป็นตัวอย่าง)
//
// ทุกชิ้นถูกออกแบบให้พอดีกล่องมาตรฐาน FIELD_H (62px):
//   ขอบ 2 + padding 12 + ชื่อช่อง LABEL_H 18 + ช่องไฟ 4 + ตัวกรอก CONTROL_H 28
// กระดาษเป็นสีขาวเสมอ จึงใช้สีคงที่ ไม่ใช้ token ของธีม (กัน dark mode ทำสีเพี้ยน)
// ============================================================
import { InlineFormIcon } from "@/components/FormIcon";
import TableCell from "@/components/TableCell";
import Icon from "@/components/Icon";
import { Camera, Check, X, Plus, Trash2, PenLine } from "lucide-react";
import type { TableColumn } from "@/lib/form-schema";
import { useT } from "@/i18n/LanguageProvider";
import {
  BOX_BORDER,
  BOX_PAD_X,
  BOX_PAD_Y,
  CONTROL_H,
  HEADER_H,
  LABEL_GAP,
  LABEL_H,
  TABLE_HEAD_H,
  TABLE_ROW_H,
} from "@/lib/paper-layout";

export const INK = "#111";
export const MUTED = "#666";
export const LINE = "#b9bec4";
const FONT = ".8rem";

/** สไตล์กล่องฟิลด์ (ตำแหน่ง/ขนาดใส่เพิ่มจากภายนอก) */
export const paperBoxStyle: React.CSSProperties = {
  position: "absolute",
  boxSizing: "border-box",
  padding: `${BOX_PAD_Y}px ${BOX_PAD_X}px`,
  border: `${BOX_BORDER}px solid transparent`,
  borderRadius: 4,
  color: INK,
};

/** สไตล์หัวข้อขั้นตอน */
export const paperStepStyle: React.CSSProperties = {
  position: "absolute",
  boxSizing: "border-box",
  height: HEADER_H,
  display: "flex",
  alignItems: "center",
  padding: `0 ${BOX_PAD_X}px`,
  border: `${BOX_BORDER}px solid transparent`,
  borderRadius: 4,
  background: "#eef0f2",
  fontWeight: 700,
  fontSize: ".92rem",
  color: INK,
  overflow: "hidden",
  whiteSpace: "nowrap",
};

/** สไตล์กล่องหัวเอกสาร / วันที่ */
export const paperHeaderBoxStyle: React.CSSProperties = {
  position: "absolute",
  boxSizing: "border-box",
  padding: `${BOX_PAD_Y}px ${BOX_PAD_X}px`,
  border: `${BOX_BORDER}px solid transparent`,
  borderRadius: 4,
  color: INK,
};

export const paperInputStyle: React.CSSProperties = {
  width: "100%",
  height: CONTROL_H,
  boxSizing: "border-box",
  padding: "0 8px",
  border: `1px solid ${LINE}`,
  borderRadius: 4,
  background: "#fff",
  color: INK,
  fontFamily: "inherit",
  fontSize: FONT,
};

export function PaperHeaderContent({ icon, title, description }: { icon: string; title: string; description?: string }) {
  return (
    <div style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 4 }}>
      <div style={{ fontSize: "1.2rem", fontWeight: 700, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <InlineFormIcon value={icon} size={18} />{title}
      </div>
      {description && (
        <div style={{ fontSize: ".72rem", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{description}</div>
      )}
    </div>
  );
}

export function PaperMetaContent({ filler, date }: { filler?: string; date?: string }) {
  const { t } = useT();
  return (
    // ชื่อยาวขึ้นบรรทัดใหม่ได้ไม่เกิน 2 บรรทัด (ตัดตามคำ) — กล่องกว้างจำกัด ห้ามล้นขอบกระดาษ
    <div style={{ fontSize: ".72rem", color: "#555", textAlign: "right", lineHeight: 1.5, minWidth: 0 }}>
      <div title={filler} style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
        {t("fw.paper.filler")} {filler || "__________"}
      </div>
      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t("fw.paper.date")} {date || "__________"}</div>
    </div>
  );
}

/** บรรทัดชื่อช่อง (สูงคงที่ LABEL_H) + ของเสริมชิดขวา */
export function PaperLabel({ label, required, right }: { label: string; required?: boolean; right?: React.ReactNode }) {
  return (
    <div style={{ height: LABEL_H, display: "flex", alignItems: "center", gap: 6, marginBottom: LABEL_GAP, fontSize: FONT, fontWeight: 600, lineHeight: `${LABEL_H}px`, color: INK }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        {label}
        {required && <span style={{ color: "#c00" }}> *</span>}
      </span>
      {right && <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>{right}</span>}
    </div>
  );
}

/** ตัวเลือกเรียงแนวนอน (ขึ้นบรรทัดใหม่เมื่อยาว) — radio หรือ checkbox */
export function PaperChoices({
  name,
  options,
  labels,
  multiple = false,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  options: string[];
  labels?: Map<string, string>;
  multiple?: boolean;
  value: string | string[];
  onChange?: (v: string | string[]) => void;
  disabled?: boolean;
}) {
  const sel = multiple ? (Array.isArray(value) ? value : []) : typeof value === "string" && value ? [value] : [];
  if (options.length === 0) return <div style={{ height: CONTROL_H, borderBottom: `1px dotted #999` }} />;
  return (
    <div style={{ minHeight: CONTROL_H, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 14px", fontSize: FONT, color: INK }}>
      {options.map((o) => {
        const on = sel.includes(o);
        const l = labels?.get(o);
        return (
          <label key={o} style={{ display: "inline-flex", alignItems: "center", gap: 5, lineHeight: "24px", cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap" }}>
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              checked={on}
              disabled={disabled}
              readOnly={!onChange}
              onChange={() => {
                if (!onChange) return;
                if (multiple) onChange(on ? sel.filter((x) => x !== o) : [...sel, o]);
                else onChange(o);
              }}
              style={{ width: 14, height: 14, margin: 0, accentColor: "#2f6fe0" }}
            />
            {l ? <>{l}<span style={{ fontSize: ".7em", color: MUTED, fontFamily: "monospace" }}>{o}</span></> : o}
          </label>
        );
      })}
    </div>
  );
}

/** ผ่าน / ไม่ผ่าน — ปุ่มเล็กบรรทัดเดียว */
export function PaperPassFail({ value, onChange, disabled = false, passLabel, failLabel, allowNa = false }: {
  value?: string; onChange?: (v: "pass" | "fail" | "na") => void; disabled?: boolean;
  /** คำบนปุ่มที่ตั้งไว้ในฟอร์ม */
  passLabel?: string; failLabel?: string; allowNa?: boolean;
}) {
  const { t } = useT();
  const btn = (kind: "pass" | "fail" | "na") => {
    const on = value === kind;
    const color = kind === "pass" ? "#15803d" : kind === "fail" ? "#dc2626" : "#444";
    return (
      <button
        type="button"
        data-print-keep={on || !value ? "" : undefined}
        disabled={disabled}
        onClick={() => onChange?.(kind)}
        style={{
          height: CONTROL_H, boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
          flex: kind === "na" ? "0 0 auto" : 1, padding: kind === "na" ? "0 8px" : undefined,
          border: `1px solid ${on ? color : LINE}`, borderRadius: 4, background: on ? (kind === "pass" ? "#e7f6ec" : kind === "fail" ? "#fdeaea" : "#eef0f2") : "#fff",
          color: on ? color : INK, fontFamily: "inherit", fontSize: FONT, fontWeight: 700, cursor: disabled ? "default" : "pointer",
        }}
      >
        {kind !== "na" && <Icon icon={kind === "pass" ? Check : X} className="h-3.5 w-3.5" />} {kind === "pass" ? passLabel || t("fw.pass") : kind === "fail" ? failLabel || t("fw.fail") : t("fw.na")}
      </button>
    );
  };
  return <div style={{ display: "flex", gap: 6 }}>{btn("pass")}{btn("fail")}{allowNa && btn("na")}</div>;
}

/** รูปถ่าย — ปุ่มถ่าย + รูปย่อ ในบรรทัดเดียว */
export function PaperPhoto({ photo, onPick, disabled = false, extra }: { photo?: string; onPick?: () => void; disabled?: boolean; extra?: React.ReactNode }) {
  const { t } = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: CONTROL_H }}>
      {photo && <img src={photo} alt={t("fw.photoAlt")} style={{ height: CONTROL_H, width: CONTROL_H * 1.33, objectFit: "cover", borderRadius: 3, border: `1px solid ${LINE}` }} />}
      <button
        type="button"
        disabled={disabled}
        onClick={onPick}
        style={{ flex: photo ? "0 0 auto" : 1, height: CONTROL_H, boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, border: `1px dashed ${LINE}`, borderRadius: 4, background: "#fff", color: MUTED, fontFamily: "inherit", fontSize: FONT, cursor: disabled ? "default" : "pointer", padding: "0 10px" }}
      >
        <Icon icon={Camera} className="h-3.5 w-3.5" /> {photo ? t("fw.paper.retake") : t("fw.paper.takePhoto")}
      </button>
      {extra && <span className="no-print" style={{ display: "contents" }}>{extra}</span>}
    </div>
  );
}

/** ลายเซ็น — กล่องแสดงลายเซ็น แตะเพื่อเปิดแผ่นเซ็นเต็มจอ */
export function PaperSignature({ url, onOpen, disabled = false }: { url?: string; onOpen?: () => void; disabled?: boolean }) {
  const { t } = useT();
  return (
    <button
      type="button"
      data-print-keep=""
      disabled={disabled}
      onClick={onOpen}
      style={{ width: "100%", height: CONTROL_H, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: url ? "flex-start" : "center", gap: 5, border: "none", borderBottom: `1px solid ${INK}`, background: "#fff", color: MUTED, fontFamily: "inherit", fontSize: FONT, cursor: disabled ? "default" : "pointer", padding: 0 }}
    >
      {url ? (
        <img src={url} alt={t("fw.paper.sigAlt")} style={{ height: CONTROL_H - 2, maxWidth: "100%", objectFit: "contain" }} />
      ) : (
        <span className="no-print" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon icon={PenLine} className="h-3.5 w-3.5" /> {t("fw.paper.tapToSign")}</span>
      )}
    </button>
  );
}

/** ตาราง — แถวสูง TABLE_ROW_H ตรงกับที่ Editor คำนวณ */
export function PaperTable({
  columns,
  rows,
  onCell,
  onDelete,
  disabled = false,
  photoOf,
  onPhoto,
}: {
  columns: TableColumn[];
  rows: Record<string, string>[];
  onCell?: (ri: number, colId: string, v: string) => void;
  onDelete?: (ri: number) => void;
  disabled?: boolean;
  /** คอลัมน์รูปถ่าย */
  photoOf?: (ri: number, colId: string) => string | undefined;
  onPhoto?: (ri: number, colId: string, file: File | null) => void;
}) {
  const { t } = useT();
  const cols = columns.length ? columns : [{ id: "c0", label: t("fw.colItem"), type: "text" as const }];
  const totalW = cols.reduce((s, c) => s + (c.width || 1), 0);
  const cell: React.CSSProperties = { width: "100%", height: TABLE_ROW_H - 1, boxSizing: "border-box", border: "none", padding: "0 5px", background: "transparent", color: INK, fontFamily: "inherit", fontSize: ".76rem", outline: "none" };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", border: `1px solid ${LINE}` }}>
      <colgroup>
        {cols.map((c) => <col key={c.id} style={{ width: `${((c.width || 1) / totalW) * 100}%` }} />)}
        {onDelete && <col className="krok-print-col-off" style={{ width: 24 }} />}
      </colgroup>
      <thead>
        <tr style={{ height: TABLE_HEAD_H, background: "#eee" }}>
          {cols.map((c) => (
            <th key={c.id} title={c.type === "formula" ? t("formula.auto") : undefined} style={{ fontSize: ".7rem", color: "#333", fontWeight: 700, textAlign: c.type === "formula" ? "right" : c.type === "checkbox" || c.type === "pass_fail" ? "center" : "left", padding: "0 5px", borderRight: "1px solid #ddd", borderBottom: `1px solid ${LINE}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.type === "formula" ? "ƒ " : ""}{c.label}</th>
          ))}
          {onDelete && <th className="no-print" style={{ borderBottom: `1px solid ${LINE}` }} />}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} style={{ height: TABLE_ROW_H, borderBottom: "1px solid #eee" }}>
            {cols.map((c) => (
              <td key={c.id} style={{ borderRight: "1px solid #eee", padding: 0, background: c.type === "pass_fail" && r[c.id] === "fail" ? "#fdeeee" : undefined }}>
                {disabled ? null : <TableCell col={c} value={r[c.id] ?? ""} onChange={(v) => onCell?.(ri, c.id, v)} look="paper" style={cell}
                  photoUrl={c.type === "photo" ? photoOf?.(ri, c.id) : undefined} onPhoto={(f) => onPhoto?.(ri, c.id, f)} />}
              </td>
            ))}
            {onDelete && (
              <td className="no-print" style={{ textAlign: "center", padding: 0 }}>
                <button type="button" onClick={() => onDelete(ri)} aria-label={t("fw.deleteRow")} style={{ border: "none", background: "transparent", color: "#dc2626", cursor: "pointer", display: "inline-flex", padding: 2 }}>
                  <Icon icon={Trash2} className="h-3.5 w-3.5" />
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** ปุ่ม "+ แถว" เล็ก ๆ สำหรับวางในบรรทัดชื่อช่อง (ไม่เพิ่มความสูงกล่อง) */
export function PaperAddRow({ onClick }: { onClick: () => void }) {
  const { t } = useT();
  return (
    <button type="button" className="no-print" onClick={onClick} style={{ height: LABEL_H, display: "inline-flex", alignItems: "center", gap: 3, border: `1px solid #2f6fe0`, borderRadius: 4, background: "#eef4ff", color: "#2f6fe0", fontFamily: "inherit", fontSize: ".7rem", fontWeight: 600, padding: "0 6px", cursor: "pointer" }}>
      <Icon icon={Plus} className="h-3 w-3" /> {t("fw.paper.row")}
    </button>
  );
}
