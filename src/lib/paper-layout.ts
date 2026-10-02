import { maxPhotosOf } from "@/lib/photo-slots";
import { FIELD_TYPE_LABELS, photoFieldsOf, printPhotosOf, type FormField, type FormSchema, type PaperBox } from "@/lib/form-schema";

// ============================================================
// ตรรกะการจัดวาง "กระดาษ A4" ที่ใช้ร่วมกันระหว่าง
// - FormPaperEditor (แก้ไขแบบลากวาง)
// - FormPaperView   (พิมพ์/ดูอย่างเดียว)
// - FillWizard      (กรอกแบบกระดาษ)
// เพื่อให้ทุกที่วางฟิลด์ "ตรงตามที่ออกแบบไว้" เหมือนกันทุกประการ
// ============================================================

export const CANVAS_W = 794; // A4 @ 96dpi
export const GRID = 8;
export const HEADER_H = 34;
export const FIELD_H = 62;
export const GAP_Y = 10;
export const START_Y = 96; // ใต้หัวกระดาษ
export const PAD = 40;

// ---- ขนาดภายในกล่อง (ใช้ร่วม Editor / หน้ากรอก ให้ตรงกันทุกพิกเซล) ----
// กล่องฟิลด์: box-sizing border-box, ขอบ 1px, padding ตามนี้
export const BOX_PAD_Y = 6;
export const BOX_PAD_X = 10;
export const BOX_BORDER = 1;
export const LABEL_H = 18;   // บรรทัดชื่อช่อง
export const LABEL_GAP = 4;  // ระหว่างชื่อช่องกับตัวกรอก
export const CONTROL_H = 26; // ความสูงตัวกรอกบรรทัดเดียว (input / ปุ่ม / แถวตัวเลือก) — ขอบ 2 + pad 12 + 18 + 4 + 26 = FIELD_H 62
export const TABLE_HEAD_H = 22;
export const TABLE_ROW_H = 26;

// หัวเอกสารแยกเป็น 2 บล็อกอิสระ: ชื่อเอกสาร + วันที่/เลขที่ (ลาก/ปรับขนาด/ซ่อนแยกกัน)
export const HEADER_KEY = "header"; // ชื่อเอกสาร
export const META_KEY = "meta";     // วันที่ / เลขที่
export const DEFAULT_HEADER_BOX: PaperBox = { x: 32, y: 26, w: 500 };
export const DEFAULT_META_BOX: PaperBox = { x: 596, y: 26, w: CANVAS_W - 32 - 596 };
// กล่องภาพประกอบ (print_photos.mode = "grid") — รวมฟิลด์รูปทั้งหมดเป็นกล่องเดียว
export const PHOTOS_KEY = "photos";

export type BlockKind = "step" | "field" | "photos";
export interface Block {
  key: string;
  kind: BlockKind;
  label: string;
  sub?: string;
  field?: FormField;
  stepIndex: number;
  /** kind "photos": ฟิลด์รูปที่อยู่ในกล่อง + การจัดเรียง */
  photos?: { fields: FormField[]; cells: PhotoCell[]; cols: number; imgH: number };
}

/** ช่องรูป 1 ช่องในกล่องภาพประกอบ (ฟิลด์หลายรูป = หลายช่อง) */
export type PhotoCell = { field: FormField; slot: number; max: number };
export function photoCellsOf(fields: FormField[]): PhotoCell[] {
  return fields.flatMap((f) => { const max = maxPhotosOf(f); return Array.from({ length: max }, (_, slot) => ({ field: f, slot, max })); });
}

/** มม. → px ที่ 96dpi (แคนวาส A4 กว้าง 794px) */
export const mmToPx = (mm: number) => Math.round(mm * 3.7795);
export const PHOTO_CAPTION_H = 18; // ชื่อฟิลด์ใต้รูป
export const PHOTO_GAP = 8;

/** ความสูงกล่องภาพประกอบ: ขอบ + padding + หัวกล่อง + แถวรูป */
export function photosBlockHeight(count: number, cols: number, imgH: number): number {
  const rows = Math.max(1, Math.ceil(count / Math.max(1, cols)));
  return BOX_BORDER * 2 + BOX_PAD_Y * 2 + LABEL_H + LABEL_GAP + rows * (imgH + PHOTO_CAPTION_H) + (rows - 1) * PHOTO_GAP;
}

export function snap(n: number) {
  return Math.round(n / GRID) * GRID;
}

// ความสูงของกล่องฟิลด์: ตารางสูงตามจำนวนแถวเริ่มต้น, ที่เหลือคงที่
// FIELD_H (62) = ขอบ 2 + padding 12 + ชื่อช่อง 18 + ช่องไฟ 4 + ตัวกรอก 28
export function fieldBoxHeight(f?: FormField): number {
  if (f?.type === "table") {
    const rows = Math.min(Math.max(f.min_rows ?? 1, 1), 6);
    return 44 + rows * 26 + 20; // หัวตาราง + แถว + ป้ายชื่อ
  }
  return FIELD_H;
}

/**
 * หน้ากรอกแบบกระดาษ: เมื่อเนื้อหาของช่องสูงเกินกล่องที่ออกแบบ (เช่น ใส่หมายเหตุตอนไม่ผ่าน,
 * เพิ่มแถวตาราง, ตัวเลือกขึ้นหลายบรรทัด) → ดันเฉพาะบล็อกที่อยู่ "ใต้" และ "ซ้อนแนวนอน" ลงมา
 * เท่ากับส่วนที่งอกออก โดยรักษาระยะห่างเดิมไว้ — ไม่มีช่องทับกัน และช่องที่ไม่เกี่ยวไม่ขยับ
 *
 * measured = ความสูงจริง (px ก่อนย่อ/ขยาย) ของแต่ละบล็อก · คืน top ใหม่ของทุกบล็อก
 */
export function reflowTops(
  blocks: Block[],
  layout: Record<string, PaperBox>,
  measured: Record<string, number>
): Record<string, number> {
  const items = blocks
    .filter((b) => layout[b.key])
    .map((b) => ({ key: b.key, box: layout[b.key], designedH: blockHeight(b) }))
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const top: Record<string, number> = {};
  const push: Record<string, number> = {}; // ระยะที่ขอบล่างของบล็อกเลื่อนไปจากที่ออกแบบ
  for (const it of items) {
    let shift = 0;
    for (const prev of items) {
      if (prev === it) break;
      if (prev.box.y >= it.box.y) continue;
      const overlapX = prev.box.x < it.box.x + it.box.w && it.box.x < prev.box.x + prev.box.w;
      if (overlapX) shift = Math.max(shift, push[prev.key] ?? 0);
    }
    top[it.key] = it.box.y + shift;
    const h = measured[it.key] ?? it.designedH;
    push[it.key] = shift + Math.max(0, h - it.designedH);
  }
  return top;
}

export function blockHeight(b: Block): number {
  if (b.kind === "photos" && b.photos) return photosBlockHeight(b.photos.cells.length, b.photos.cols, b.photos.imgH);
  return b.kind === "step" ? HEADER_H : fieldBoxHeight(b.field);
}

// วางอัตโนมัติแบบเรียงบนลงล่าง (หัวข้อเต็มแถว, ฟิลด์ 2 คอลัมน์)
export function autoLayout(blocks: Block[]): Record<string, PaperBox> {
  const out: Record<string, PaperBox> = {};
  const usable = CANVAS_W - PAD * 2;
  const colW = Math.floor((usable - 16) / 2);
  let y = START_Y;
  let col = 0;
  for (const b of blocks) {
    if (b.kind === "step") {
      if (col === 1) y += FIELD_H + GAP_Y;
      col = 0;
      out[b.key] = { x: PAD, y, w: usable };
      y += HEADER_H + GAP_Y;
    } else if (b.kind === "photos") {
      if (col === 1) { y += FIELD_H + GAP_Y; col = 0; }
      out[b.key] = { x: PAD, y, w: usable };
      y += blockHeight(b) + GAP_Y;
    } else if (b.field?.width === "full" || b.field?.type === "table") {
      // ฟิลด์เต็มแถว (รวมตาราง) — ปิดคู่ครึ่งแถวที่ค้างก่อน
      if (col === 1) { y += FIELD_H + GAP_Y; col = 0; }
      out[b.key] = { x: PAD, y, w: usable };
      y += fieldBoxHeight(b.field) + GAP_Y;
    } else {
      const x = PAD + (col === 0 ? 0 : colW + 16);
      out[b.key] = { x, y, w: colW };
      if (col === 1) {
        y += FIELD_H + GAP_Y;
        col = 0;
      } else {
        col = 1;
      }
    }
  }
  return out;
}

export function buildBlocks(schema: FormSchema): Block[] {
  const blocks: Block[] = [];
  const pp = printPhotosOf(schema);
  const photoFields = pp.mode === "grid" ? photoFieldsOf(schema).map((p) => p.field) : [];
  const grouped = photoFields.length > 0;
  schema.steps.forEach((s, si) => {
    blocks.push({ key: `s:${s.id}`, kind: "step", label: `${si + 1}. ${s.title}`, stepIndex: si });
    s.fields.forEach((f) => {
      if (grouped && f.type === "photo") return; // อยู่ในกล่องภาพประกอบแทน
      blocks.push({
        key: f.id,
        kind: "field",
        label: f.label,
        sub: FIELD_TYPE_LABELS[f.type] + (f.unit ? ` (${f.unit})` : ""),
        field: f,
        stepIndex: si,
      });
    });
  });
  if (grouped) {
    blocks.push({
      key: PHOTOS_KEY, kind: "photos", label: "", stepIndex: schema.steps.length - 1,
      photos: { fields: photoFields, cells: photoCellsOf(photoFields), cols: pp.cols, imgH: mmToPx(pp.height_mm) },
    });
  }
  return blocks;
}

// layout สุดท้าย: ใช้ค่าที่ออกแบบไว้ (schema.layout) ทับบนค่า auto
export function resolveLayout(schema: FormSchema, blocks?: Block[]): Record<string, PaperBox> {
  const bl = blocks ?? buildBlocks(schema);
  const merged = { ...autoLayout(bl) };
  if (schema.layout) {
    for (const b of bl) {
      if (schema.layout[b.key]) merged[b.key] = schema.layout[b.key];
    }
  }
  return merged;
}

// ความสูงรวมของแคนวาสตาม layout
export function canvasHeight(blocks: Block[], layout: Record<string, PaperBox>, min = 900): number {
  let max = min;
  for (const b of blocks) {
    const box = layout[b.key];
    if (box) max = Math.max(max, box.y + blockHeight(b) + 60);
  }
  return max;
}
