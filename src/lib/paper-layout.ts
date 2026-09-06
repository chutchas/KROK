import { FIELD_TYPE_LABELS, type FormField, type FormSchema, type PaperBox } from "@/lib/form-schema";

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

export type BlockKind = "step" | "field";
export interface Block {
  key: string;
  kind: BlockKind;
  label: string;
  sub?: string;
  field?: FormField;
  stepIndex: number;
}

export function snap(n: number) {
  return Math.round(n / GRID) * GRID;
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
  schema.steps.forEach((s, si) => {
    blocks.push({ key: `s:${s.id}`, kind: "step", label: `${si + 1}. ${s.title}`, stepIndex: si });
    s.fields.forEach((f) => {
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
    if (box) max = Math.max(max, box.y + (b.kind === "step" ? HEADER_H : FIELD_H) + 60);
  }
  return max;
}
