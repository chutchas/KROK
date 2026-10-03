import { countFields, type FormSchema } from "@/lib/form-schema";
import { isWorkflowSchema } from "@/lib/case-flow";

// สรุปย่อของฟอร์ม (คอลัมน์ forms.summary จาก migration 0050) — ใช้แสดงรายการโดยไม่ต้องโหลด schema เต็ม
export type FormSummary = {
  category?: string;
  privacy_notice?: string;
  steps: number;
  fields: number;
  workflow: boolean;
};

/** คำนวณจาก schema (ใช้ตอนยังไม่รัน 0050 หรือหลังแก้ฟอร์มในหน้า) — ต้องตรงกับ public.form_summary() */
export function summaryOf(schema: FormSchema): FormSummary {
  const s: FormSummary = { steps: schema.steps.length, fields: countFields(schema), workflow: isWorkflowSchema(schema) };
  if (schema.category) s.category = schema.category;
  if (schema.privacy_notice) s.privacy_notice = schema.privacy_notice;
  return s;
}

/** อ่านค่าจาก DB แบบปลอดภัย (ค่าเพี้ยน/ไม่มี = 0) */
export function readSummary(raw: unknown): FormSummary {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const s: FormSummary = { steps: n(o.steps), fields: n(o.fields), workflow: o.workflow === true };
  if (typeof o.category === "string" && o.category) s.category = o.category;
  if (typeof o.privacy_notice === "string" && o.privacy_notice) s.privacy_notice = o.privacy_notice;
  return s;
}
