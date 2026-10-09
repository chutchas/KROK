import type { FormSchema } from "@/lib/form-schema";

/**
 * เดาตัวเลือกที่น่าจะหมายถึงข้อบกพร่อง — ใช้แค่ "เสนอ" ในหน้าสร้างฟอร์ม (เจ้าของฟอร์มกดยืนยันเอง)
 * ไม่ใช้ตัดสินผลเอง: คำบางคำกำกวม เช่น "ขาด" ในฟอร์มลงเวลา = ขาดงาน ไม่ใช่ของชำรุด
 */
/** คำที่อยู่ส่วนไหนของตัวเลือกก็ได้ · ต้องตรงกับ 0078_form_defect_hint.sql (มีเทสต์ตรวจ) */
export const DEFECT_CONTAINS = ["ชำรุด", "เสียหาย", "ไม่ผ่าน", "ผิดปกติ", "ไม่ปกติ", "แตก", "รั่ว", "บุบ", "ฉีกขาด", "ไม่สมบูรณ์", "ใช้งานไม่ได้", "damage", "broken", "defect", "faulty", "leak"];
/** คำที่ต้องเป็นตัวเลือกทั้งคำ (สั้น/กำกวมถ้าอยู่ในคำอื่น) */
export const DEFECT_EXACT = ["เสีย", "ng", "n/g", "fail", "failed"];
const STRONG = { test: (o: string) => { const l = o.trim().toLowerCase(); return DEFECT_EXACT.includes(l) || DEFECT_CONTAINS.some((w) => l.includes(w)); } };
/** กำกวม → เสนอเฉพาะเมื่อในชุดเดียวกันมีคำชัดเจนข้างบนอยู่แล้ว (เช่น ปกติ/ชำรุด/ขาด) */
const WEAK = /^(ขาด|หาย|สูญหาย|ไม่ครบ|missing|lost|short)$/i;

export function guessDefectOptions(options: string[]): string[] {
  const opts = options.map((o) => o.trim()).filter(Boolean);
  const strong = opts.filter((o) => STRONG.test(o));
  if (!strong.length) return [];
  return opts.filter((o) => STRONG.test(o) || WEAK.test(o));
}

export type DefectSuggestion = {
  fieldId: string;
  /** มี = คอลัมน์ในตาราง */
  colId?: string;
  /** ชื่อที่แสดง เช่น "รายการสินค้า › สภาพ" */
  label: string;
  options: string[];
};

/** ช่อง/คอลัมน์ตัวเลือก (พิมพ์เอง) ที่ยังไม่ได้ตั้ง fail_options แต่มีตัวเลือกที่ดูเหมือนข้อบกพร่อง */
export function defectSuggestions(schema: FormSchema): DefectSuggestion[] {
  if (schema.defect_ack) return [];
  const out: DefectSuggestion[] = [];
  for (const st of schema.steps)
    for (const f of st.fields) {
      if ((f.type === "select" || f.type === "checkbox") && !f.options_source && !f.area && !f.fail_options?.length) {
        const g = guessDefectOptions(f.options || []);
        if (g.length) out.push({ fieldId: f.id, label: f.label, options: g });
      }
      if (f.type === "table")
        for (const c of f.columns || []) {
          if (c.type !== "select" || c.options_source || c.fail_options?.length) continue;
          const g = guessDefectOptions(c.options || []);
          if (g.length) out.push({ fieldId: f.id, colId: c.id, label: `${f.label} › ${c.label}`, options: g });
        }
    }
  return out;
}

/** ใส่ fail_options ตามที่เสนอ (คืน schema ใหม่ ไม่แก้ของเดิม) */
export function applyDefectSuggestions(schema: FormSchema, list: DefectSuggestion[]): FormSchema {
  const key = (fid: string, cid?: string) => `${fid}|${cid ?? ""}`;
  const m = new Map(list.map((s) => [key(s.fieldId, s.colId), s.options]));
  return {
    ...schema,
    defect_ack: true,
    steps: schema.steps.map((st) => ({
      ...st,
      fields: st.fields.map((f) => {
        const own = m.get(key(f.id));
        const cols = f.columns?.map((c) => { const o = m.get(key(f.id, c.id)); return o ? { ...c, fail_options: o } : c; });
        return { ...f, ...(own ? { fail_options: own } : {}), ...(cols ? { columns: cols } : {}) };
      }),
    })),
  };
}
