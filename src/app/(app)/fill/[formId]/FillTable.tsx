"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { ScanLine, Plus, Trash2, Link2 } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { type FormField, type TableColumn } from "@/lib/form-schema";
import { PaperAddRow, PaperLabel, PaperTable } from "@/components/paper/PaperParts";
import LiveScanner from "@/components/LiveScanner";
import TableCell from "@/components/TableCell";
import { computeRow } from "@/lib/formula";
import { cellPhotoKey, newRowPhotoKey } from "@/lib/table-rows";
import { MediaPhotos, TableRow } from "./fill-types";
import { useShrink } from "./photo-stamp";

// ============ single field control ============
export function useIsNarrow() {
  const [n, setN] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setN(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return n;
}

/**
 * สถานะแถวของตาราง (ใช้ร่วมทั้งหน้ากรอกปกติและกระดาษ)
 * - ทุกครั้งที่แก้: คำนวณคอลัมน์สูตรของแถวนั้นใหม่ แล้วส่งค่าขึ้นไป (คำตอบจึงมีผลสูตรเสมอ)
 * - คอลัมน์สแกน: สแกนต่อเนื่อง ใส่ช่องว่างแรกของคอลัมน์ ไม่มีช่องว่าง → เพิ่มแถวใหม่
 */
export function useTableRows(cols: TableColumn[], rows: TableRow[], setRows: React.Dispatch<React.SetStateAction<TableRow[]>>, onChange: (rows: TableRow[]) => void, fieldId = "", media?: MediaPhotos) {
  const [scanOpen, setScanOpen] = useState(false);
  const shrinkImage = useShrink(); // ย่อรูป + ลายน้ำ (ถ้าฟอร์มเปิด)
  const scanCol = cols.find((c) => c.type === "scan");
  // แถวล่าสุด (สแกนต่อเนื่องเรียกถี่กว่ารอบ render) — แถวเปลี่ยนผ่าน commit เท่านั้น จึงตรงกับ state เสมอ
  const live = useRef(rows);
  const commit = (next: TableRow[]) => { live.current = next; setRows(next); onChange(next); };
  // แถวจากฟอร์มลูก (0074) แก้/ลบไม่ได้ — ระบบเขียนให้ และ server ทับคืนอยู่ดี
  const setCell = (ri: number, cid: string, v: string) => {
    if (isChildRow(live.current[ri])) return;
    commit(live.current.map((r, i) => (i === ri ? computeRow(cols, { ...r, [cid]: v }) : r)));
  };
  const addRow = () => commit([...live.current, {}]);
  const photoCols = cols.filter((c) => c.type === "photo");
  const dropRowPhotos = (r: TableRow | undefined) => { if (r && media) for (const c of photoCols) { const k = cellPhotoKey(r, c.id); if (k) media.set(k, null); } };
  const delRow = (ri: number) => { if (isChildRow(live.current[ri])) return; dropRowPhotos(live.current[ri]); commit(live.current.length > 1 ? live.current.filter((_, i) => i !== ri) : [{}]); };
  /** รูปของช่อง: ย่อรูป → เก็บด้วย key ของช่อง (มีอยู่แล้วใช้ key เดิม = ถ่ายทับ) */
  const onPhoto = async (ri: number, cid: string, file: File | null) => {
    if (!media) return;
    const cur = live.current[ri] ? cellPhotoKey(live.current[ri], cid) : undefined;
    if (!file) { if (cur) media.set(cur, null); setCell(ri, cid, ""); return; }
    try {
      const data = await shrinkImage(file);
      const key = cur ?? newRowPhotoKey(fieldId, cid);
      media.set(key, data);
      setCell(ri, cid, key);
    } catch { /* อ่านรูปไม่ได้ — ข้าม */ }
  };
  const photoOf = (key: string | undefined) => (key && media ? media.get(key) : undefined);
  const onScanned = (code: string) => {
    if (!scanCol) return;
    const cur = live.current;
    const at = cur.findIndex((r) => !String(r[scanCol.id] ?? "").trim());
    if (at >= 0) commit(cur.map((r, i) => (i === at ? computeRow(cols, { ...r, [scanCol.id]: code }) : r)));
    else commit([...cur, computeRow(cols, { [scanCol.id]: code })]);
  };
  return { commit, setCell, addRow, delRow, scanCol, scanOpen, setScanOpen, onScanned, onPhoto, photoOf };
}

/** แถวที่ระบบเขียนกลับจากฟอร์มลูก */
export const isChildRow = (r: TableRow | null | undefined): boolean => !!r && typeof r === "object" && "_child" in r && !!r._child;

// ตารางกรอกข้อมูล — desktop = ตาราง, มือถือ = การ์ดต่อแถว
/** แถวมีค่าอย่างน้อย 1 ช่อง (แถวว่างล้วนไม่ตรวจ) */
export function rowHasValue(r: TableRow | null | undefined): boolean {
  return !!r && typeof r === "object" && Object.values(r).some((v) => String(v ?? "").trim() !== "");
}

/** แถวแรกที่ยังขาดคอลัมน์บังคับ (index ตามแถวจริง รวมแถวว่าง) — ไม่มี = null */
export function firstBadRow(columns: TableColumn[], rows: TableRow[]): { row: number; col: TableColumn } | null {
  const reqCols = columns.filter((c) => c.required && c.type !== "formula");
  for (let ri = 0; ri < rows.length; ri++) {
    if (!rowHasValue(rows[ri])) continue;
    for (const c of reqCols) {
      const v = c.type === "photo" ? cellPhotoKey(rows[ri], c.id) : String(rows[ri][c.id] ?? "").trim();
      if (!v) return { row: ri, col: c };
    }
  }
  return null;
}

export function TableInput({
  columns, minRows, maxRows, initial, onChange, variant, fieldId, media, error, childOnly = false,
}: {
  /** ตารางรับแถวจากฟอร์มลูกเท่านั้น — เพิ่ม/แก้แถวเองไม่ได้ */
  childOnly?: boolean;
  /** ข้อความผิดพลาดของฟิลด์ — มีขึ้นมาใหม่ = กางแถวที่ผิดแล้วเลื่อนไปให้เห็น */
  error?: string;
  fieldId: string;
  /** จำนวนแถวสูงสุด (ไม่ระบุ = ไม่จำกัด) */
  maxRows?: number;
  media?: MediaPhotos;
  columns: TableColumn[];
  minRows: number;
  initial: TableRow[];
  onChange: (rows: TableRow[]) => void;
  variant: "normal" | "paper" | "compact";
}) {
  const { t, tt } = useT();
  const cols = columns.length ? columns : [{ id: "c0", label: t("fw.colItem"), type: "text" as const }];
  const [rows, setRows] = useState<TableRow[]>(() => {
    const base = initial.length ? initial.map((r) => computeRow(cols, { ...r })) : [];
    if (childOnly) return base.filter(isChildRow);
    while (base.length < Math.max(1, minRows)) base.push({});
    return base;
  });
  const narrow = useIsNarrow();
  const cards = narrow || variant === "compact";
  const small = variant !== "normal";
  // สีกระดาษ (ขาว/ดำ) เฉพาะมุมมองกระดาษ — มุมมองปกติใช้สีตามธีม (โหมดมืดไม่ขาวโพลน)
  const ink = small
    ? { field: "#fff", text: "#111", border: "#c3c8ce", card: "#fafbfc", cardBorder: "#d5d9de", muted: "#555", head: "#444", rule: "#ccc" }
    : { field: "var(--surface)", text: "var(--ink)", border: "var(--line)", card: "var(--code-bg)", cardBorder: "var(--line)", muted: "var(--ink-2)", head: "var(--ink-2)", rule: "var(--line)" };

  const { setCell, addRow: addRowRaw, delRow, scanCol, scanOpen, setScanOpen, onScanned, onPhoto, photoOf } = useTableRows(cols, rows, setRows, onChange, fieldId, media);
  const canAdd = !childOnly && (!maxRows || rows.length < maxRows);
  // มือถือ: เปิดแก้ทีละแถว แถวอื่นพับเป็นบรรทัดสรุป (ตารางหลายคอลัมน์ไม่ยาวเป็นหน้า ๆ)
  const [openRow, setOpenRow] = useState(() => {
    const firstEmpty = rows.findIndex((r) => !Object.values(r).some((v) => String(v ?? "").trim()));
    return firstEmpty >= 0 ? firstEmpty : rows.length - 1;
  });
  const addRow = () => { if (!canAdd) return; addRowRaw(); setOpenRow(rows.length); };
  // กดส่ง/ถัดไปแล้วมีแถวผิด → กางแถวนั้น + เลื่อนไปหา + กรอบแดง
  const bad = error ? firstBadRow(cols, rows) : null;
  const badRow = error ? (bad ? bad.row : 0) : -1;
  const rowEls = useRef<(HTMLElement | null)[]>([]);
  const [prevErr, setPrevErr] = useState(error);
  const [focusTick, setFocusTick] = useState(0);
  if (error !== prevErr) {
    setPrevErr(error);
    if (error) { setOpenRow(badRow); setFocusTick((n) => n + 1); }
  }
  useEffect(() => {
    if (!focusTick || badRow < 0) return;
    const id = window.setTimeout(() => rowEls.current[badRow]?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick]);
  const colLabel = (c: TableColumn) => <>{c.type === "formula" ? "ƒ " : ""}{c.label}{c.required && <span style={{ color: "var(--fail)" }}> *</span>}</>;
  const rowSummary = (r: TableRow) => cols
    .filter((c) => c.type !== "photo")
    .map((c) => { const v = String(r[c.id] ?? "").trim(); return v ? (c.type === "pass_fail" ? (v === "pass" ? "✓" : v === "fail" ? "✗" : v) : v) : ""; })
    .filter(Boolean).slice(0, 4).join(" · ");

  const cellInput = (ri: number, c: TableColumn) => {
    if (isChildRow(rows[ri])) {
      const v = String(rows[ri]?.[c.id] ?? "");
      return <span style={{ display: "block", padding: small ? "5px 2px" : "8px 2px", fontSize: small ? ".82rem" : ".95rem", color: ink.text, overflowWrap: "anywhere" }}>{c.type === "pass_fail" ? (v === "pass" ? "✓" : v === "fail" ? "✗" : v) : v || "—"}</span>;
    }
    const st: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: small ? "5px 7px" : "8px 9px", border: `1px solid ${ink.border}`, borderRadius: 6, background: ink.field, color: ink.text, fontFamily: "inherit", fontSize: small ? ".82rem" : ".95rem" };
    return <TableCell col={c} value={rows[ri]?.[c.id] ?? ""} onChange={(v) => setCell(ri, c.id, v)} look={small ? "small" : "normal"} style={st} iconOnly={!cards}
      photoUrl={c.type === "photo" ? photoOf(rows[ri] ? cellPhotoKey(rows[ri], c.id) : undefined) : undefined} onPhoto={(f) => void onPhoto(ri, c.id, f)} />;
  };

  const btnSt: React.CSSProperties = { marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent-soft)", color: "var(--accent-text)", cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600 };
  const childBadge = (r: TableRow) => isChildRow(r) ? (
    <span title={String(r._at ?? "")} style={{ fontSize: ".7rem", padding: "1px 7px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent-text)", whiteSpace: "nowrap" }}>
      {tt("child.rowFrom", { form: String(r._src ?? "") })}
    </span>
  ) : null;
  const addBtn = childOnly ? (
    rows.length === 0 ? <span style={{ display: "block", marginTop: 6, fontSize: ".8rem", color: ink.muted }}>{t("child.tableWaiting")}</span> : null
  ) : (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {canAdd ? (
        <button type="button" onClick={addRow} style={btnSt}>
          <Icon icon={Plus} className="h-3.5 w-3.5" /> {t("fw.addRow")}
        </button>
      ) : (
        <span style={{ marginTop: 8, fontSize: ".78rem", color: ink.muted }}>{tt("fw.maxRowsReached", { n: maxRows ?? 0 })}</span>
      )}
      {scanCol && (
        <button type="button" onClick={() => setScanOpen(true)} style={{ ...btnSt, background: "var(--accent)", color: "var(--accent-ink)" }}>
          <Icon icon={ScanLine} className="h-3.5 w-3.5" /> {t("ctype.scanAdd")}
        </button>
      )}
      {scanOpen && <LiveScanner continuous onResult={onScanned} onClose={() => setScanOpen(false)} />}
    </div>
  );

  if (cards) {
    return (
      <div>
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((r, ri) => ri !== openRow && variant !== "compact" ? (
            // แถวที่พับ: แตะเพื่อแก้
            <button key={ri} type="button" onClick={() => setOpenRow(ri)} ref={(el) => { rowEls.current[ri] = el; }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: `1px solid ${ri === badRow ? "var(--fail)" : ink.cardBorder}`, borderRadius: 10, padding: "10px 12px", background: ink.card, color: ink.text, fontFamily: "inherit", cursor: "pointer" }}>
              <b style={{ fontSize: ".78rem", color: ink.muted, whiteSpace: "nowrap" }}>{tt("fw.rowN", { n: ri + 1 })}</b>
              {childBadge(r)}
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: ".86rem", color: rowSummary(r) ? ink.text : ink.muted }}>{rowSummary(r) || t("fw.rowEmpty")}</span>
              <span style={{ fontSize: ".78rem", color: "var(--accent-text)", whiteSpace: "nowrap" }}>{t("fw.rowEdit")}</span>
            </button>
          ) : (
            <div key={ri} ref={(el) => { rowEls.current[ri] = el; }} style={{ border: `${ri === badRow ? 2 : 1}px solid ${ri === badRow ? "var(--fail)" : variant !== "compact" ? "var(--accent)" : ink.cardBorder}`, borderRadius: 10, padding: 10, background: ink.card }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <b style={{ fontSize: ".78rem", color: ink.muted }}>{tt("fw.rowN", { n: ri + 1 })} {childBadge(r)}</b>
                {!isChildRow(r) && <button type="button" onClick={() => delRow(ri)} aria-label={t("fw.deleteRow")} style={{ border: "none", background: "transparent", color: "var(--fail)", cursor: "pointer", minWidth: 36, minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon icon={Trash2} className="h-4 w-4" /></button>}
              </div>
              <div style={{ display: "grid", gap: 7 }}>
                {cols.map((c) => (
                  <label key={c.id} style={{ display: "grid", gap: 3 }}>
                    <span style={{ fontSize: ".76rem", color: ink.muted, fontWeight: 600 }}>{colLabel(c)}</span>
                    {cellInput(ri, c)}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {addBtn}
      </div>
    );
  }

  const totalW = cols.reduce((s, c) => s + (c.width || 1), 0);
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: cols.length * 90 + 44 }}>
          <colgroup>
            {cols.map((c) => <col key={c.id} style={{ width: `${((c.width || 1) / totalW) * 96}%` }} />)}
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr>
              {cols.map((c) => <th key={c.id} style={{ textAlign: c.type === "formula" ? "right" : "left", fontSize: small ? ".76rem" : ".82rem", color: ink.head, padding: "4px 6px", borderBottom: `1px solid ${ink.rule}`, fontWeight: 700 }}>{colLabel(c)}</th>)}
              <th style={{ borderBottom: `1px solid ${ink.rule}` }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((_, ri) => (
              <tr key={ri} ref={(el) => { rowEls.current[ri] = el; }} style={ri === badRow ? { outline: "2px solid var(--fail)", outlineOffset: -2 } : undefined}>
                {cols.map((c) => <td key={c.id} style={{ padding: "3px 5px", verticalAlign: "top" }}>{cellInput(ri, c)}</td>)}
                <td style={{ padding: "3px 2px", textAlign: "center", verticalAlign: "middle" }}>
                  {isChildRow(rows[ri]) ? <span title={tt("child.rowFrom", { form: String(rows[ri]._src ?? "") })} aria-label={tt("child.rowFrom", { form: String(rows[ri]._src ?? "") })} style={{ color: "var(--accent-text)", display: "inline-flex" }}><Icon icon={Link2} className="h-4 w-4" /></span> : <button type="button" onClick={() => delRow(ri)} aria-label={t("fw.deleteRow")} style={{ border: "none", background: "transparent", color: "var(--fail)", cursor: "pointer", minWidth: 36, minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon icon={Trash2} className="h-4 w-4" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {addBtn}
    </div>
  );
}

/** ตารางในโหมดกระดาษ: ชื่อช่อง + ปุ่ม "+ แถว" ในบรรทัดเดียว แล้วตารางจริงแถวสูงเท่าที่ออกแบบ */
export function PaperTableField({ field: f, initial, onChange, media }: { field: FormField; initial: TableRow[]; onChange: (rows: TableRow[]) => void; media?: MediaPhotos }) {
  const [rows, setRows] = useState<TableRow[]>(() => {
    const base = initial.length ? initial.map((r) => computeRow(f.columns || [], { ...r })) : [];
    while (base.length < Math.max(1, f.min_rows || 1)) base.push({});
    return base;
  });
  const { setCell, addRow, delRow, scanCol, scanOpen, setScanOpen, onScanned, onPhoto, photoOf } = useTableRows(f.columns || [], rows, setRows, onChange, f.id, media);
  const { t } = useT();
  return (
    <>
      <PaperLabel label={f.label} required={f.required} right={
        <span style={{ display: "inline-flex", gap: 4 }}>
          {scanCol && (
            <button type="button" className="no-print" onClick={() => setScanOpen(true)} title={t("ctype.scanAdd")} aria-label={t("ctype.scanAdd")}
              style={{ display: "inline-flex", alignItems: "center", gap: 3, border: "1px solid #2f6fe0", borderRadius: 4, background: "#2f6fe0", color: "#fff", fontFamily: "inherit", fontSize: ".7rem", fontWeight: 600, padding: "0 6px", cursor: "pointer" }}>
              <Icon icon={ScanLine} className="h-3 w-3" /> {t("ctype.scan")}
            </button>
          )}
          {!f.child_only && (!f.max_rows || rows.length < f.max_rows) && <PaperAddRow onClick={addRow} />}
        </span>
      } />
      <PaperTable
        columns={f.columns || []}
        rows={rows}
        onCell={setCell}
        onDelete={rows.length > 1 ? delRow : undefined}
        photoOf={(ri, cid) => photoOf(rows[ri] ? cellPhotoKey(rows[ri], cid) : undefined)}
        onPhoto={(ri, cid, file) => void onPhoto(ri, cid, file)}
      />
      {scanOpen && <LiveScanner continuous onResult={onScanned} onClose={() => setScanOpen(false)} />}
    </>
  );
}

