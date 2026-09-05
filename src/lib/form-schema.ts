// ============================================================
// KROK · form schema types + sanitizer
// schema เดียวที่ AI สร้าง / editor แก้ / mobile render / dashboard อ่าน
// ============================================================

export const FIELD_TYPES = [
  "text",
  "number",
  "select",
  "checkbox",
  "pass_fail",
  "photo",
  "barcode",
  "signature",
  "datetime",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  tooltip?: string;
  example?: string;
  // number
  min?: number;
  max?: number;
  unit?: string;
  // select / checkbox
  options?: string[];
  // photo
  photo_hint?: string;
  // pass_fail
  on_fail_require_note?: boolean;
}

export interface FormStep {
  id: string;
  title: string;
  fields: FormField[];
}

export interface PaperBox {
  x: number;
  y: number;
  w: number;
}

export interface FormSchema {
  title: string;
  description: string;
  icon: string;
  flow: "sequential";
  steps: FormStep[];
  // ตำแหน่ง element บนมุมมองกระดาษ (px บนแคนวาส A4 กว้าง 794)
  // key = field id, "s:<stepId>" สำหรับหัวข้อขั้นตอน
  layout?: Record<string, PaperBox>;
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "ข้อความ",
  number: "ตัวเลข",
  select: "เลือก 1 ข้อ",
  checkbox: "เลือกหลายข้อ",
  pass_fail: "ผ่าน/ไม่ผ่าน",
  photo: "รูปถ่าย",
  barcode: "บาร์โค้ด/QR",
  signature: "ลายเซ็น",
  datetime: "วันเวลา",
};

const str = (v: unknown, max: number, fallback = ""): string => {
  const s = v == null ? fallback : String(v);
  return s.slice(0, max);
};
const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
};

/**
 * รับ object ดิบ (จาก AI หรือ client) → คืน FormSchema ที่สะอาดและปลอดภัย
 * throw ถ้าไม่มี field ใช้งานได้เลย
 */
export function sanitizeSchema(raw: unknown): FormSchema {
  if (!raw || typeof raw !== "object") throw new Error("schema ไม่ถูกต้อง");
  const r = raw as Record<string, unknown>;

  const rawSteps = Array.isArray(r.steps) ? r.steps : [];
  const steps: FormStep[] = rawSteps
    .map((s: unknown, si: number): FormStep => {
      const so = (s ?? {}) as Record<string, unknown>;
      const rawFields = Array.isArray(so.fields) ? so.fields : [];
      const fields: FormField[] = rawFields
        .filter(
          (f: unknown) =>
            f &&
            typeof f === "object" &&
            FIELD_TYPES.includes((f as Record<string, unknown>).type as FieldType)
        )
        .map((f: unknown, fi: number): FormField => {
          const fo = f as Record<string, unknown>;
          const type = fo.type as FieldType;
          const o: FormField = {
            id: str(fo.id, 40, `f${si}_${fi}`).replace(/[^\w-]/g, "_") || `f${si}_${fi}`,
            type,
            label: str(fo.label, 200, "ไม่ระบุ"),
            required: fo.required !== false,
          };
          if (fo.tooltip) o.tooltip = str(fo.tooltip, 300);
          if (fo.example != null && fo.example !== "") o.example = str(fo.example, 120);
          if (type === "number") {
            const mn = num(fo.min);
            const mx = num(fo.max);
            if (mn !== undefined) o.min = mn;
            if (mx !== undefined) o.max = mx;
            if (fo.unit) o.unit = str(fo.unit, 20);
          }
          if ((type === "select" || type === "checkbox") && Array.isArray(fo.options)) {
            o.options = fo.options.slice(0, 12).map((x) => str(x, 80));
          }
          if (type === "photo" && fo.photo_hint) o.photo_hint = str(fo.photo_hint, 200);
          if (type === "pass_fail") o.on_fail_require_note = fo.on_fail_require_note !== false;
          return o;
        });
      return {
        id: `s${si + 1}`,
        title: str(so.title, 120, `ขั้นตอนที่ ${si + 1}`),
        fields,
      };
    })
    .filter((s) => s.fields.length > 0);

  if (steps.length === 0) throw new Error("ฟอร์มไม่มีฟิลด์ที่ใช้งานได้");

  // เก็บ layout กระดาษ (ลากวาง) เฉพาะ key ที่ตรงกับ field id / "s:<stepId>" ที่มีจริง
  const validKeys = new Set<string>();
  for (const s of steps) {
    validKeys.add(`s:${s.id}`);
    for (const f of s.fields) validKeys.add(f.id);
  }
  let layout: Record<string, PaperBox> | undefined;
  if (r.layout && typeof r.layout === "object") {
    const out: Record<string, PaperBox> = {};
    for (const [k, v] of Object.entries(r.layout as Record<string, unknown>)) {
      if (!validKeys.has(k) || !v || typeof v !== "object") continue;
      const vo = v as Record<string, unknown>;
      const x = num(vo.x);
      const y = num(vo.y);
      const w = num(vo.w);
      if (x === undefined || y === undefined || w === undefined) continue;
      out[k] = {
        x: Math.max(0, Math.min(794, Math.round(x))),
        y: Math.max(0, Math.round(y)),
        w: Math.max(60, Math.min(794, Math.round(w))),
      };
    }
    if (Object.keys(out).length > 0) layout = out;
  }

  const schema: FormSchema = {
    title: str(r.title, 150, "ฟอร์มใหม่"),
    description: str(r.description, 300),
    icon: str(r.icon, 4, "📋") || "📋",
    flow: "sequential",
    steps,
  };
  if (layout) schema.layout = layout;
  return schema;
}

export function countFields(schema: FormSchema): number {
  return schema.steps.reduce((n, s) => n + s.fields.length, 0);
}
