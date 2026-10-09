// ============================================================
// KROK · แปลงแถวตารางที่กรอก → แถวที่เก็บใน submission (ใช้ร่วม: หน้ากรอก / API ภายนอก / ฟอร์มสาธารณะ)
// - ตัดแถวว่าง (นับเฉพาะคอลัมน์ที่คนกรอก ไม่นับคอลัมน์สูตร)
// - คำนวณคอลัมน์สูตรใหม่เสมอ (ไม่เชื่อค่าที่ส่งมา)
// - "แสดงชื่อ เก็บรหัส": ช่องเก็บชื่อ + "<col>#code" เก็บรหัส
// - ผ่าน/ไม่ผ่าน, ติ๊กถูก: เก็บเป็นคำที่อ่านได้ในเอกสาร/PDF
// - คอลัมน์ผ่าน/ไม่ผ่านที่ "ไม่ผ่าน" → รายการไม่ผ่านของเอกสาร
// ============================================================
import type { FormField, TableColumn } from "@/lib/form-schema";
import { isFailChoice, labelMap } from "@/lib/form-schema";
import { tableCodeKey } from "@/lib/answer-item";
import { computeRow } from "@/lib/formula";

type Row = Record<string, string>;

// ---------- รูปถ่ายต่อแถว ----------
// ระหว่างกรอก: ช่องเก็บ "media key" = <fieldId>.<colId>.<สุ่ม> (ใช้เป็นชื่อไฟล์/field_id ของ submission_photos)
// ตอนเก็บ: ช่องแสดง "มีรูป" (อ่านได้ทุกที่ เช่น Excel/PDF) + "<colId>#photo" เก็บ key ไว้ดึงรูป
export const PHOTO_SUFFIX = "#photo";
export const rowPhotoKeyOf = (colId: string) => `${colId}${PHOTO_SUFFIX}`;
const ROW_PHOTO_RE = /^([\w-]+)\.([\w-]+)\.([a-z0-9]{6,16})$/;
export function newRowPhotoKey(fieldId: string, colId: string): string {
  return `${fieldId}.${colId}.${Math.random().toString(36).slice(2, 10)}`;
}
export function isRowPhotoKey(v: unknown): v is string { return typeof v === "string" && ROW_PHOTO_RE.test(v); }
/** media key → field id ของตาราง (ใช้หาขั้นตอนของรูป) · key ทั่วไป (รูปของฟิลด์) คืนตัวเอง */
export function mediaFieldId(key: string): string { return key.split(".")[0]; }
/** key รูปของช่องนี้ (ค่าระหว่างกรอก หรือค่าที่เก็บแล้ว) */
export function cellPhotoKey(r: Row, colId: string): string | undefined {
  const k = r[rowPhotoKeyOf(colId)] ?? r[colId];
  return isRowPhotoKey(k) ? k : undefined;
}

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
export function finalizeTableRows(f: FormField, raw: Row[], hasPhoto?: (key: string) => boolean): { rows: Row[]; fails: string[]; photoKeys: string[] } {
  const cols = f.columns || [];
  const typeOf = new Map(cols.map((c) => [c.id, c.type]));
  const filled = raw
    .filter((r) => r && Object.entries(r).some(([k, v]) => String(v ?? "").trim() !== "" && typeOf.get(k.replace(PHOTO_SUFFIX, "")) !== "formula" && typeOf.has(k.replace(PHOTO_SUFFIX, ""))))
    .map((r) => {
      // ผ่าน/ไม่ผ่าน + ติ๊กถูก → รหัสก่อน (สูตรอ่านค่าเป็น 1/0)
      const n: Row = { ...r };
      for (const c of cols) {
        if (c.type === "photo") {
          const k = cellPhotoKey(r, c.id);
          delete n[rowPhotoKeyOf(c.id)];
          // รูปต้องเป็นของช่องนี้จริง และ (ฝั่ง server) ต้องมีไฟล์แนบมาจริง
          if (k && k.startsWith(`${f.id}.${c.id}.`) && (!hasPhoto || hasPhoto(k))) n[c.id] = k; else delete n[c.id];
        }
        if (c.type === "pass_fail") { const k = passFailCode(r[c.id]); if (k) n[c.id] = k; else delete n[c.id]; }
        if (c.type === "checkbox") { if (checkCode(r[c.id])) n[c.id] = "1"; else delete n[c.id]; }
      }
      return computeRow(cols, n);
    })
    // หลังแปลงค่า (เช่น รูปที่ไม่มีไฟล์ถูกตัดออก) แถวอาจว่างลง → ตัดอีกรอบ
    .filter((r) => Object.entries(r).some(([k, v]) => String(v ?? "").trim() !== "" && typeOf.has(k) && typeOf.get(k) !== "formula"));
  const fails: string[] = [];
  filled.forEach((r, ri) => cols.forEach((c) => {
    if (cellFails(c, r[tableCodeKey(c.id)] ?? r[c.id])) fails.push(`${f.label} แถว ${ri + 1}: ${c.label}`);
  }));
  const photoKeys: string[] = [];
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
      if (c.type === "photo" && r[c.id]) {
        photoKeys.push(r[c.id]);
        out[rowPhotoKeyOf(c.id)] = r[c.id];
        out[c.id] = "มีรูป";
      }
    }
    return out;
  });
  return { rows, fails, photoKeys };
}

/** ช่องในตารางที่ไม่ผ่าน: ผ่าน/ไม่ผ่าน = "fail" · ตัวเลือกที่ตั้งว่าเป็นข้อบกพร่อง (เช่น ชำรุด/ขาด) */
export function cellFails(c: TableColumn, v: unknown): boolean {
  if (c.type === "pass_fail") return passFailCode(v) === "fail";
  if (c.type === "select") return isFailChoice(c.fail_options, v);
  return false;
}

/** แถวที่ไม่ผ่านแต่ยังไม่มีรูปในคอลัมน์รูป (ตารางที่เปิด require_photo_on_fail) → เลขแถว (เริ่ม 1) */
export function failRowsMissingPhoto(f: FormField, raw: Row[], hasPhoto: (key: string) => boolean): number[] {
  if (!f.require_photo_on_fail) return [];
  const cols = f.columns || [];
  const photoCols = cols.filter((c) => c.type === "photo");
  if (!photoCols.length) return [];
  const out: number[] = [];
  let n = 0;
  for (const r of raw) {
    if (!r || !Object.values(r).some((v) => String(v ?? "").trim() !== "")) continue;
    n++;
    if (!cols.some((c) => cellFails(c, r[c.id]))) continue;
    const has = photoCols.some((c) => { const k = cellPhotoKey(r, c.id); return !!k && hasPhoto(k); });
    if (!has) out.push(n);
  }
  return out;
}
