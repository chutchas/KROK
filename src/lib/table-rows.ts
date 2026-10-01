// ============================================================
// KROK · แปลงแถวตารางที่กรอก → แถวที่เก็บใน submission (ใช้ร่วม: หน้ากรอก / API ภายนอก / ฟอร์มสาธารณะ)
// - ตัดแถวว่าง (นับเฉพาะคอลัมน์ที่คนกรอก ไม่นับคอลัมน์สูตร)
// - คำนวณคอลัมน์สูตรใหม่เสมอ (ไม่เชื่อค่าที่ส่งมา)
// - "แสดงชื่อ เก็บรหัส": ช่องเก็บชื่อ + "<col>#code" เก็บรหัส
// - ผ่าน/ไม่ผ่าน, ติ๊กถูก: เก็บเป็นคำที่อ่านได้ในเอกสาร/PDF
// - คอลัมน์ผ่าน/ไม่ผ่านที่ "ไม่ผ่าน" → รายการไม่ผ่านของเอกสาร
// ============================================================
import type { FormField, TableColumn } from "@/lib/form-schema";
import { labelMap } from "@/lib/form-schema";
import { tableCodeKey } from "@/lib/answer-item";
import { computeRow } from "@/lib/formula";

type Row = Record<string, string>;

export const PASS_WORDS = ["pass", "ผ่าน", "ok", "true", "1"];
export const FAIL_WORDS = ["fail", "ไม่ผ่าน", "ng", "false", "0"];

/** ค่าผ่าน/ไม่ผ่าน → "pass" | "fail" | "" */
export function passFailCode(v: unknown): "pass" | "fail" | "" {
  const s = String(v ?? "").trim().toLowerCase();
  if (PASS_WORDS.includes(s)) return "pass";
  if (FAIL_WORDS.includes(s)) return "fail";
  return "";
}
/** ค่าติ๊กถูก → "1" | "" */
export function checkCode(v: unknown): "1" | "" {
  const s = String(v ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "ใช่", "✓", "x"].includes(s) ? "1" : "";
}

export function tableCellDisplay(c: Pick<TableColumn, "type">, v: string | undefined): string | undefined {
  if (c.type === "pass_fail") { const k = passFailCode(v); return k === "pass" ? "ผ่าน" : k === "fail" ? "ไม่ผ่าน" : undefined; }
  if (c.type === "checkbox") return checkCode(v) ? "ใช่" : undefined;
  return v;
}

/** แถวที่กรอก (ค่าเป็นรหัส/ค่าดิบ) → แถวที่เก็บ + รายการไม่ผ่าน */
export function finalizeTableRows(f: FormField, raw: Row[]): { rows: Row[]; fails: string[] } {
  const cols = f.columns || [];
  const typeOf = new Map(cols.map((c) => [c.id, c.type]));
  const filled = raw
    .filter((r) => r && Object.entries(r).some(([k, v]) => String(v ?? "").trim() !== "" && typeOf.get(k) !== "formula" && typeOf.has(k)))
    .map((r) => {
      // ผ่าน/ไม่ผ่าน + ติ๊กถูก → รหัสก่อน (สูตรอ่านค่าเป็น 1/0)
      const n: Row = { ...r };
      for (const c of cols) {
        if (c.type === "pass_fail") { const k = passFailCode(r[c.id]); if (k) n[c.id] = k; else delete n[c.id]; }
        if (c.type === "checkbox") { if (checkCode(r[c.id])) n[c.id] = "1"; else delete n[c.id]; }
      }
      return computeRow(cols, n);
    });
  const fails: string[] = [];
  filled.forEach((r, ri) => cols.forEach((c) => {
    if (c.type === "pass_fail" && r[c.id] === "fail") fails.push(`${f.label} แถว ${ri + 1}: ${c.label}`);
  }));
  const rows = filled.map((r) => {
    const out: Row = { ...r };
    for (const c of cols) {
      if (c.option_labels?.length) {
        const code = r[c.id];
        const name = code ? labelMap(c.options, c.option_labels).get(code) : undefined;
        if (name) { out[c.id] = name; out[tableCodeKey(c.id)] = code; }
      }
      if (c.type === "pass_fail" || c.type === "checkbox") {
        const d = tableCellDisplay(c, r[c.id]);
        if (d) out[c.id] = d; else delete out[c.id];
      }
      if (c.type === "formula" && !out[c.id]) delete out[c.id];
    }
    return out;
  });
  return { rows, fails };
}
