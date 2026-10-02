// ============================================================
// KROK · ฟิลด์รูปถ่ายแบบหลายรูป (max_photos)
// ช่องที่ 1 ใช้ key = field id (เหมือนฟิลด์รูปเดียวเดิม → ข้อมูลเก่าใช้ต่อได้)
// ช่องที่ 2.. ใช้ key = <fieldId>.ph.slotNN (รูปแบบเดียวกับ media key ของตาราง → แบบร่าง/งาน/อัปโหลดใช้ทางเดิม)
// ============================================================
import type { FormField } from "@/lib/form-schema";

export const MAX_PHOTOS_LIMIT = 12;

export function photoSlotKey(fieldId: string, slot: number): string {
  return slot <= 0 ? fieldId : `${fieldId}.ph.slot${String(slot).padStart(2, "0")}`;
}

/** key นี้เป็นช่องรูปของฟิลด์ไหน ช่องที่เท่าไร (ไม่ใช่ = null) */
export function parsePhotoSlotKey(key: string): { fieldId: string; slot: number } | null {
  const m = /^([\w-]+)\.ph\.slot(\d{2})$/.exec(key);
  if (m) return { fieldId: m[1], slot: Number(m[2]) };
  return /^[\w-]+$/.test(key) ? { fieldId: key, slot: 0 } : null;
}

/** จำนวนรูปสูงสุดของฟิลด์ (1 = รูปเดียวแบบเดิม) */
export function maxPhotosOf(f: Pick<FormField, "type" | "max_photos">): number {
  if (f.type !== "photo") return 1;
  return Math.min(MAX_PHOTOS_LIMIT, Math.max(1, Math.round(f.max_photos ?? 1)));
}

/** จำนวนรูปขั้นต่ำที่ต้องมีตอนส่ง (ไม่บังคับ = 0 · บังคับ = ค่าที่ตั้ง หรือ 1) */
export function minPhotosOf(f: Pick<FormField, "type" | "max_photos" | "min_photos" | "required">): number {
  if (!f.required) return 0;
  const max = maxPhotosOf(f);
  return Math.min(max, Math.max(1, Math.round(f.min_photos ?? 1)));
}

/** key ของทุกช่องรูปของฟิลด์ (ตามลำดับ) */
export function allPhotoSlotKeys(f: Pick<FormField, "id" | "type" | "max_photos">): string[] {
  return Array.from({ length: maxPhotosOf(f) }, (_, i) => photoSlotKey(f.id, i));
}

/** key ของช่องที่มีรูปแล้ว (ตามลำดับ) */
export function filledPhotoKeys(f: Pick<FormField, "id" | "type" | "max_photos">, has: (key: string) => boolean): string[] {
  return allPhotoSlotKeys(f).filter(has);
}

/** key รูปของคำตอบที่เก็บแล้ว (รองรับทั้งรูปเดียวแบบเดิมและหลายรูป) */
export function answerPhotoKeys(a: { photoField?: string; photoFields?: string[] }): string[] {
  if (Array.isArray(a.photoFields) && a.photoFields.length) return a.photoFields;
  return a.photoField ? [a.photoField] : [];
}

/** ป้ายชื่อของช่องรูป: ฟิลด์หลายรูปต่อท้ายด้วยลำดับ เช่น "รูปสินค้า (2/4)" */
export function photoSlotLabel(label: string, slot: number, max: number): string {
  return max > 1 ? `${label} (${slot + 1}/${max})` : label;
}
