// ============================================================
// KROK · คอลัมน์คำตอบรายช่องสำหรับรายงาน Excel (ฟังก์ชันบริสุทธิ์ เทสต์ได้)
//
// จับคู่ด้วย "ชื่อช่อง" ของคำตอบที่บันทึกไว้จริงใน submission ไม่ใช้ schema ปัจจุบัน
// → submission ก่อนแก้ฟอร์มไม่เพี้ยน (แลกกับ: เปลี่ยนชื่อช่อง = ได้ 2 คอลัมน์)
// ชื่อช่องซ้ำในฟอร์มเดียวกัน แยกด้วยลำดับการปรากฏ เช่น "หมายเหตุ", "หมายเหตุ (2)"
// ============================================================
import { tableCodeKey, type AnswerItem } from "@/lib/answer-item";

export interface AnswerColumn {
  key: string;
  label: string;
  type: string;
  /** มีรหัส (แสดงชื่อ เก็บรหัส) อย่างน้อยหนึ่ง submission → เพิ่มคอลัมน์ "(รหัส)" */
  hasCode: boolean;
}

export interface TableSheet {
  key: string;
  label: string;
  columns: { id: string; label: string; hasCode: boolean }[];
}

/** key ของคำตอบแต่ละตัวใน submission หนึ่ง (label + ลำดับเมื่อซ้ำ) */
export function answerKeys(answers: AnswerItem[]): string[] {
  const seen = new Map<string, number>();
  return answers.map((a) => {
    const base = String(a?.label ?? "").trim() || "(ไม่มีชื่อ)";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/**
 * รวบรวมคอลัมน์จากทุก submission
 * ลำดับ: ตามลำดับที่พบ — ส่ง submission ใหม่สุดก่อน ช่องของฟอร์มเวอร์ชันล่าสุดจึงอยู่หน้า
 */
export function collectColumns(all: AnswerItem[][]): { columns: AnswerColumn[]; tables: TableSheet[] } {
  const cols = new Map<string, AnswerColumn>();
  const tables = new Map<string, TableSheet>();
  for (const answers of all) {
    if (!Array.isArray(answers)) continue;
    const keys = answerKeys(answers);
    answers.forEach((a, i) => {
      if (!a || typeof a !== "object") return;
      const key = keys[i];
      let c = cols.get(key);
      if (!c) {
        c = { key, label: key, type: String(a.type ?? ""), hasCode: false };
        cols.set(key, c);
      }
      if (a.code) c.hasCode = true;

      if (a.type === "table" && Array.isArray(a.columns)) {
        let t = tables.get(key);
        if (!t) {
          t = { key, label: key, columns: [] };
          tables.set(key, t);
        }
        for (const tc of a.columns) {
          if (!tc?.id) continue;
          let col = t.columns.find((x) => x.id === tc.id);
          if (!col) {
            col = { id: tc.id, label: String(tc.label ?? tc.id), hasCode: false };
            t.columns.push(col);
          }
          if ((a.rows || []).some((r) => r && r[tableCodeKey(tc.id)])) col.hasCode = true;
        }
      }
    });
  }
  return { columns: [...cols.values()], tables: [...tables.values()] };
}

/** ค่าที่ใส่ในเซลล์ของคำตอบหนึ่งช่อง */
export function answerCell(a: AnswerItem | undefined): string {
  if (!a) return "";
  if (a.type === "photo" || a.type === "signature") {
    if (a.display && a.display !== "เซ็นแล้ว") return a.display; // ผล AI ตรวจรูป
    return a.photoField ? (a.type === "signature" ? "เซ็นแล้ว" : "มีรูป") : "";
  }
  const d = a.display == null || a.display === "—" ? "" : String(a.display);
  return a.note ? (d ? `${d} — ${a.note}` : a.note) : d;
}

/** Map key → คำตอบ ของ submission หนึ่ง */
export function answersByKey(answers: AnswerItem[]): Map<string, AnswerItem> {
  const m = new Map<string, AnswerItem>();
  if (!Array.isArray(answers)) return m;
  const keys = answerKeys(answers);
  answers.forEach((a, i) => m.set(keys[i], a));
  return m;
}

/** ชื่อชีตของ Excel: ≤ 31 ตัว ห้าม []:*?/\ และห้ามซ้ำ */
export function sheetName(label: string, used: Set<string>): string {
  const base = (label.replace(/[[\]:*?/\\]/g, " ").trim() || "ตาราง").slice(0, 28);
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 26)} ${n++}`;
  used.add(name.toLowerCase());
  return name;
}
