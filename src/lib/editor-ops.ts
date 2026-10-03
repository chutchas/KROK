// ============================================================
// คำสั่งแก้ฟอร์มที่ใช้ร่วมกัน (คีย์บอร์ด / คลิกขวา / มุมมองมือถือ+กระดาษ) — pure function คืน schema ใหม่
// key ของบล็อก: field id · "s:<stepId>" = หัวข้อขั้นตอน · HEADER_KEY / META_KEY = หัวเอกสาร / วันที่-เลขที่
// ============================================================
import type { FormField, FormSchema, PaperBox } from "@/lib/form-schema";
import { CANVAS_W, GRID, HEADER_KEY, META_KEY } from "@/lib/paper-layout";

export type FieldLoc = { si: number; fi: number; field: FormField };

export function findField(schema: FormSchema, id: string | null | undefined): FieldLoc | null {
  if (!id) return null;
  for (let si = 0; si < schema.steps.length; si++) {
    const fi = schema.steps[si].fields.findIndex((f) => f.id === id);
    if (fi >= 0) return { si, fi, field: schema.steps[si].fields[fi] };
  }
  return null;
}

export const stepIndexOfKey = (schema: FormSchema, key: string | null | undefined): number =>
  key?.startsWith("s:") ? schema.steps.findIndex((s) => s.id === key.slice(2)) : -1;

/** ชื่อที่ใช้แสดงในข้อความ (เช่น "ลบ … แล้ว") */
export function blockLabel(schema: FormSchema, key: string): string {
  const loc = findField(schema, key);
  if (loc) return loc.field.label || "";
  const si = stepIndexOfKey(schema, key);
  return si >= 0 ? schema.steps[si].title || `${si + 1}` : "";
}

/**
 * ลบบล็อก: ฟิลด์ / ขั้นตอน (พร้อมฟิลด์ข้างใน — ต้องเหลืออย่างน้อย 1 ขั้นตอน) / หัวเอกสาร = ซ่อน
 * คืน null = ลบไม่ได้
 */
export function removeBlock(schema: FormSchema, key: string): FormSchema | null {
  if (key === HEADER_KEY) return { ...schema, show_header: false };
  if (key === META_KEY) return { ...schema, show_meta: false };
  const layout = schema.layout ? { ...schema.layout } : undefined;
  const loc = findField(schema, key);
  if (loc) {
    if (layout) delete layout[key];
    const steps = schema.steps.map((s, i) => (i === loc.si ? { ...s, fields: s.fields.filter((_, j) => j !== loc.fi) } : s));
    return withLayout({ ...schema, steps }, layout);
  }
  const si = stepIndexOfKey(schema, key);
  if (si < 0 || schema.steps.length <= 1) return null;
  if (layout) {
    delete layout[key];
    for (const f of schema.steps[si].fields) delete layout[f.id];
  }
  return withLayout({ ...schema, steps: schema.steps.filter((_, i) => i !== si) }, layout);
}

function withLayout(s: FormSchema, layout: Record<string, PaperBox> | undefined): FormSchema {
  if (layout === undefined) return s;
  return { ...s, layout };
}

/** แทรกฟิลด์ (สำเนา) ลงขั้นตอน si ตำแหน่ง at — box = ตำแหน่งบนกระดาษ (ไม่ระบุ = จัดอัตโนมัติ) */
export function insertField(schema: FormSchema, field: FormField, si: number, at: number, box?: PaperBox): FormSchema {
  const idx = Math.max(0, Math.min(si, schema.steps.length - 1));
  const steps = schema.steps.map((s, i) => {
    if (i !== idx) return s;
    const pos = Math.max(0, Math.min(at, s.fields.length));
    return { ...s, fields: [...s.fields.slice(0, pos), field, ...s.fields.slice(pos)] };
  });
  return box && schema.layout ? { ...schema, steps, layout: { ...schema.layout, [field.id]: box } } : { ...schema, steps };
}

/** กล่องของสำเนา: เยื้องลงขวาจากต้นฉบับเล็กน้อย (มองเห็นว่าเป็นอีกชิ้น) */
export function offsetBox(base: PaperBox | undefined): PaperBox | undefined {
  if (!base) return undefined;
  return { x: Math.min(CANVAS_W - base.w, base.x + GRID * 2), y: base.y + GRID * 2, w: base.w };
}

/** ทำสำเนาฟิลด์ต่อท้ายต้นฉบับ */
export function duplicateField(schema: FormSchema, id: string, newId: string): FormSchema | null {
  const loc = findField(schema, id);
  if (!loc) return null;
  const copy: FormField = { ...structuredClone(loc.field), id: newId };
  return insertField(schema, copy, loc.si, loc.fi + 1, offsetBox(schema.layout?.[id]));
}

/**
 * เลื่อนลำดับ (ลำดับที่คนกรอกเห็น) — ฟิลด์: ขึ้น/ลงในขั้นตอน ถึงขอบแล้วข้ามไปขั้นตอนข้างเคียง
 * ขั้นตอน: สลับกับขั้นตอนข้างเคียง · คืน null = เลื่อนต่อไม่ได้
 */
export function moveInOrder(schema: FormSchema, key: string, dir: -1 | 1): FormSchema | null {
  const loc = findField(schema, key);
  if (loc) {
    const steps = schema.steps.map((s) => ({ ...s, fields: [...s.fields] }));
    const cur = steps[loc.si].fields;
    const to = loc.fi + dir;
    if (to >= 0 && to < cur.length) {
      [cur[loc.fi], cur[to]] = [cur[to], cur[loc.fi]];
      return { ...schema, steps };
    }
    const ns = loc.si + dir;
    if (ns < 0 || ns >= steps.length) return null;
    cur.splice(loc.fi, 1);
    if (dir < 0) steps[ns].fields.push(loc.field);
    else steps[ns].fields.unshift(loc.field);
    return { ...schema, steps };
  }
  const si = stepIndexOfKey(schema, key);
  const to = si + dir;
  if (si < 0 || to < 0 || to >= schema.steps.length) return null;
  const steps = [...schema.steps];
  [steps[si], steps[to]] = [steps[to], steps[si]];
  return { ...schema, steps };
}

/** ลำดับบล็อกสำหรับ Tab: หัวเอกสาร → วันที่/เลขที่ → (ขั้นตอน → ฟิลด์ในขั้นตอน)… */
export function orderedKeys(schema: FormSchema): string[] {
  const out = [HEADER_KEY, META_KEY];
  for (const s of schema.steps) {
    out.push(`s:${s.id}`);
    for (const f of s.fields) out.push(f.id);
  }
  return out;
}

// ---- คลิปบอร์ด: คัดลอกฟิลด์ข้ามแท็บ/ข้ามฟอร์มได้ (ข้อความ JSON มีตัวระบุ) ----
const CLIP_TAG = "krok-field/v1";

export function serializeClip(field: FormField): string {
  return JSON.stringify({ [CLIP_TAG]: field });
}

export function parseClip(text: string | null | undefined): FormField | null {
  if (!text || text.length > 200_000 || !text.includes(CLIP_TAG)) return null;
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    const f = o[CLIP_TAG] as FormField | undefined;
    if (!f || typeof f !== "object" || typeof f.type !== "string" || typeof f.id !== "string") return null;
    return f;
  } catch {
    return null;
  }
}
