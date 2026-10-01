// พจนานุกรมข้อความ UI (ไทย/อังกฤษ) — เนื้อหาฟอร์มไม่รวมในนี้ (เป็นภาษาที่ผู้สร้างกรอก)
// แยกไฟล์ต่อภาษา: th.ts โหลดมากับแอปเสมอ (ภาษาหลัก + ใช้แทนเมื่อคำแปลยังไม่มา)
//                 en.ts โหลดแยกเมื่อเลือก EN เท่านั้น — ผู้ใช้ภาษาไทยไม่ต้องดาวน์โหลดคำแปลอังกฤษ
import type { th } from "./th";

export type Lang = "th" | "en";
export type MessageKey = keyof typeof th;
export type Dict = Record<MessageKey, string>;

/** แทนที่ตัวแปรในสตริง เช่น tt("forms.stepsFields", {steps:3, fields:9}) */
export function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
