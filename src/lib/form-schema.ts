import { cleanImageUrl, sanitizeFormTheme, type FormTheme } from "@/lib/theme";
// ============================================================
// KROK · form schema types + sanitizer
// schema เดียวที่ AI สร้าง / editor แก้ / mobile render / dashboard อ่าน
// ============================================================
import { normalizeIcon } from "@/lib/form-icons";

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
  "table",
  "formula",
  "child_form",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

// ============================================================
// ตัวเลือกจาก dataset (ข้อมูลอ้างอิง)
// ใช้กับ select / checkbox / คอลัมน์ select ของตาราง
// ตัวเลือกจริงถูกดึงฝั่ง server ตอนเปิดหน้ากรอก (resolveFormOptions) แล้วฝังมากับหน้า
// จึงใช้ออฟไลน์ได้ด้วยข้อมูลรอบล่าสุดที่โหลดไว้ — ไม่เก็บตัวเลือกไว้ใน schema
// ============================================================
export interface OptionsSource {
  dataset_id: string;
  /** คอลัมน์ที่เอาค่ามาเป็นตัวเลือก — ค่านี้คือสิ่งที่ถูกบันทึก (เช่น รหัส) */
  column: string;
  /**
   * คอลัมน์ที่แสดงให้ผู้กรอกเห็น (เช่น ชื่อ) — ไม่ตั้ง = แสดงค่าของ column ตรง ๆ
   * ตั้งแล้ว submission เก็บทั้งชื่อ (display) และรหัส (code)
   */
  label_column?: string;
  /**
   * dropdown ที่กรองตามกัน: เหลือเฉพาะแถวที่ค่า "column" ของ dataset
   * ตรงกับคำตอบของฟิลด์ field_id (ต้องเป็น select/checkbox ที่อยู่ก่อนหน้าในฟอร์ม)
   * ใช้กับฟิลด์เท่านั้น ไม่ใช้กับคอลัมน์ตาราง
   */
  parent?: { column: string; field_id: string };
}

// คอลัมน์ของฟิลด์ตาราง
export const TABLE_COL_TYPES = ["text", "number", "select", "formula", "pass_fail", "checkbox", "datetime", "scan", "photo"] as const;
export type TableColType = (typeof TABLE_COL_TYPES)[number];
export interface TableColumn {
  id: string;
  label: string;
  type: TableColType;
  options?: string[]; // เฉพาะ select
  options_source?: OptionsSource; // เฉพาะ select — ตัวเลือกจาก dataset
  option_labels?: string[];       // runtime เท่านั้น: ชื่อที่แสดงของแต่ละตัวเลือก (ขนานกับ options)
  width?: number;     // น้ำหนักความกว้างสัมพัทธ์ (>=1) default 1
  /** คอลัมน์ที่ต้องกรอกทุกแถว (แถวที่มีข้อมูล) */
  required?: boolean;
  /** เฉพาะ formula — สูตรรายแถว อ้างคอลัมน์อื่นด้วย {colId} (ดู lib/formula.ts) */
  formula?: string;
  /** เฉพาะ formula — ทศนิยม (default 2) */
  decimals?: number;
  /** เฉพาะ select (ตัวเลือกที่พิมพ์เอง) — ตัวเลือกที่นับเป็นข้อบกพร่อง เช่น ["ชำรุด","ขาด"] → แถวนั้นไม่ผ่าน */
  fail_options?: string[];
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  tooltip?: string;
  example?: string;
  // number / formula
  min?: number;
  max?: number;
  unit?: string;
  /** formula — สูตร อ้างฟิลด์ด้วย {fieldId} และคอลัมน์ตารางด้วย {tableId.colId} (ดู lib/formula.ts) */
  formula?: string;
  /** formula — ทศนิยมที่แสดง/ปัด (default 2) */
  decimals?: number;
  // select / checkbox
  options?: string[];
  /** ตัวเลือกจาก dataset แทน options ที่พิมพ์เอง */
  options_source?: OptionsSource;
  /**
   * runtime เท่านั้น (ไม่บันทึก): ค่าคอลัมน์กรองของแต่ละตัวเลือก ขนานกับ options
   * ใส่มาเมื่อ options_source มี parent
   */
  options_parents?: string[];
  /** runtime เท่านั้น: ข้อความเตือนเมื่อดึงตัวเลือกจาก dataset ไม่ได้ */
  options_error?: string;
  /** runtime เท่านั้น: ชื่อที่แสดงของแต่ละตัวเลือก ขนานกับ options (options = ค่าที่บันทึก) */
  option_labels?: string[];
  /** runtime เท่านั้น: ตัวเลือกจาก dataset มีมากกว่าที่ส่งมาให้ (ถูกตัดที่เพดาน) */
  options_truncated?: boolean;
  /**
   * ฟิลด์ "พื้นที่" (เฉพาะ select · ฟอร์มละ 1 ช่อง) — ตัวเลือกมาจากรายชื่อพื้นที่ของ workspace (ตั้งค่า › พื้นที่)
   * ค่าที่บันทึก = รหัสพื้นที่ · แสดงชื่อ · ฐานข้อมูลใช้หาใบที่ยังไม่จบในพื้นที่เดียวกัน (0072)
   */
  area?: true;
  /** ฟิลด์พื้นที่: รหัสพื้นที่ที่เลือกไว้ให้ก่อน (ฟอร์มที่ใช้ที่เดียวตายตัว) */
  area_default?: string;
  /** child_form — ปุ่มเปิดฟอร์มลูก (ไม่มีคำตอบของตัวเอง · ไม่พิมพ์ลงกระดาษ) */
  child_form?: ChildFormConfig;
  /** runtime เท่านั้น: ตารางนี้รับแถวจากฟอร์มลูกเท่านั้น (คนถือขั้นเพิ่ม/แก้แถวเองไม่ได้) */
  child_only?: true;
  // ความกว้างในหน้ากระดาษ: full = เต็มแถว, half = ครึ่งแถว (default ปฏิบัติเหมือน half)
  width?: "full" | "half";
  // photo
  photo_hint?: string;
  /** ฟิลด์รูปถ่าย: ใส่ได้สูงสุดกี่รูป (1–12, ไม่ระบุ = 1) */
  max_photos?: number;
  /** ฟิลด์รูปถ่ายที่บังคับกรอก: ต้องมีอย่างน้อยกี่รูป (ไม่ระบุ = 1) */
  min_photos?: number;
  /** ชื่อใต้รูปแต่ละช่อง (แยกจากชื่อฟิลด์) เช่น ["ด้านหน้า","ด้านข้าง"] — ว่าง = "รูปที่ n" */
  photo_labels?: string[];
  /** ช่องรูปที่ไม่บังคับ แต่ต้องแนบเมื่อใบนี้มีข้อไม่ผ่าน (เช่น รูปสินค้าชำรุด) */
  required_if_fail?: boolean;
  // text
  /** ข้อความยาวหลายบรรทัด (ไม่ระบุ = ข้อความสั้นบรรทัดเดียว) */
  long_text?: boolean;
  /** รูปแบบข้อความ: เบอร์โทร / อีเมล (คีย์บอร์ดตรงชนิด + ตรวจรูปแบบ) */
  text_format?: "phone" | "email";
  // datetime
  /** วันที่+เวลา (default) / วันที่อย่างเดียว / เวลาอย่างเดียว */
  dt_mode?: "datetime" | "date" | "time";
  /** ไม่ใส่วัน/เวลาปัจจุบันให้อัตโนมัติ */
  dt_no_default?: boolean;
  // pass_fail
  on_fail_require_note?: boolean;
  /** คำบนปุ่มผ่าน/ไม่ผ่าน (ไม่ระบุ = ผ่าน / ไม่ผ่าน) */
  pass_label?: string;
  fail_label?: string;
  /** มีตัวเลือก "ไม่เกี่ยวข้อง (N/A)" */
  allow_na?: boolean;
  // signature
  /** ให้พิมพ์ชื่อผู้เซ็นกำกับ */
  sign_name?: boolean;
  /** select/checkbox (ตัวเลือกที่พิมพ์เอง) — ตัวเลือกที่นับเป็นข้อบกพร่อง → ใบนี้ไม่ผ่าน */
  fail_options?: string[];
  // table
  columns?: TableColumn[];
  /** ตาราง: แถวที่ไม่ผ่านต้องแนบรูปในคอลัมน์รูปของแถวนั้น (ต้องมีคอลัมน์รูป) */
  require_photo_on_fail?: boolean;
  min_rows?: number; // จำนวนแถวเริ่มต้นที่แสดงตอนกรอก (default 1)
  /** จำนวนแถวสูงสุดที่เพิ่มได้ (ไม่ระบุ = ไม่จำกัด) */
  max_rows?: number;
}

// ============================================================
// ฟอร์มลูก (0074): ปุ่มในใบงานหลักเปิดงานของอีกฟอร์ม แล้วรับผลกลับเป็นแถวใหม่ในตาราง
// ============================================================
/** ชนิดฟิลด์ที่ส่งค่าไป/รับค่ากลับได้ (เหมือนแหล่งเติมข้อมูล) */
export const CHILD_MAP_TYPES: FieldType[] = ["text", "number", "datetime", "select"];
/**
 * ฟิลด์ของฟอร์มลูกที่ส่งกลับเข้าคอลัมน์ชนิดนี้ได้ ([] = คอลัมน์นี้รับค่าจากฟอร์มลูกไม่ได้)
 * ผ่าน/ไม่ผ่าน และ ติ๊ก ต้องคู่กับชนิดเดียวกัน — "ไม่ผ่าน" นับเป็นข้อบกพร่องของใบหลัก
 */
export function childSourceTypesFor(colType: TableColType): FieldType[] {
  if (colType === "pass_fail") return ["pass_fail"];
  if (colType === "checkbox") return ["checkbox"];
  if (colType === "text" || colType === "number" || colType === "select" || colType === "datetime") return CHILD_MAP_TYPES;
  return [];
}

export interface ChildFormConfig {
  form_id: string;
  /** ชื่อฟอร์มลูก ณ ตอนตั้งค่า (ใช้แสดงเมื่ออ่านฟอร์มลูกไม่ได้) */
  form_title?: string;
  /** ส่งไป: ช่องในขั้นแรกของฟอร์มลูก ← ช่องของใบหลัก (from) หรือค่าคงที่ (value) */
  send: { to: string; from?: string; value?: string }[];
  /** ตารางในขั้นเดียวกับปุ่มที่รับผลกลับ */
  table_id: string;
  /** รับกลับ: คอลัมน์ของตาราง ← ช่องของฟอร์มลูก */
  map: { col: string; from: string }[];
  /** เปิดได้หลายครั้ง (default true) */
  multiple: boolean;
  /** ห้ามไปขั้นถัดไปถ้ายังมีฟอร์มลูกค้าง (default true) */
  gate: boolean;
  /** ตารางรับข้อมูลจากฟอร์มลูกเท่านั้น — ต้องมีผลอย่างน้อย 1 ใบก่อนไปต่อ (default false = คนถือขั้นคีย์เองได้) */
  source_only: boolean;
}

const ID_RE = /^[\w-]{1,40}$/;
export function sanitizeChildForm(raw: unknown): ChildFormConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const form_id = String(o.form_id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(form_id)) return undefined;
  const send: ChildFormConfig["send"] = [];
  for (const x of Array.isArray(o.send) ? o.send.slice(0, 60) : []) {
    const e = (x ?? {}) as Record<string, unknown>;
    const to = String(e.to ?? "");
    if (!ID_RE.test(to) || send.some((y) => y.to === to)) continue;
    const from = String(e.from ?? "");
    if (ID_RE.test(from)) send.push({ to, from });
    else if (typeof e.value === "string" && e.value.trim()) send.push({ to, value: e.value.slice(0, 500) });
  }
  const map: ChildFormConfig["map"] = [];
  for (const x of Array.isArray(o.map) ? o.map.slice(0, 60) : []) {
    const e = (x ?? {}) as Record<string, unknown>;
    const col = String(e.col ?? ""), from = String(e.from ?? "");
    if (ID_RE.test(col) && ID_RE.test(from) && !map.some((y) => y.col === col)) map.push({ col, from });
  }
  const table_id = String(o.table_id ?? "");
  return {
    form_id,
    ...(typeof o.form_title === "string" && o.form_title.trim() ? { form_title: o.form_title.slice(0, 200) } : {}),
    send,
    table_id: ID_RE.test(table_id) ? table_id : "",
    map,
    multiple: o.multiple !== false,
    gate: o.gate !== false,
    source_only: o.source_only === true,
  };
}

/** ฟิลด์ที่ไม่มีคำตอบของตัวเอง (UI ของเว็บเท่านั้น) */
export const isUiOnlyField = (f: Pick<FormField, "type">) => f.type === "child_form";

// ============================================================
// แหล่งเติมข้อมูล (fill source)
// "ข้อมูล 1 แหล่ง → เติมได้หลายฟิลด์" — ถ่าย/สแกนครั้งเดียว ไม่ต้องทำซ้ำรายช่อง
//
//   kind = "scan" : บาร์โค้ด/QR — ถอดรหัสบนเครื่องผู้ใช้
//                   ฟรี ไม่ใช้ AI ไม่หักเครดิต ใช้งานออฟไลน์ได้ แม่น 100% จึงไม่ต้องให้ยืนยัน
//   kind = "doc"  : อ่านเอกสารด้วย vision model — หักเครดิต 1 ต่อการถ่าย 1 ครั้ง
//                   ต้องให้คนหน้างานยืนยันเสมอ และใช้ไม่ได้ตอนออฟไลน์
//
// อยู่ที่ "ระดับ step" โดยตั้งใจ: ฟิลด์ปลายทางต้องอยู่ step เดียวกันเท่านั้น
// จึงเติมข้ามขั้นตอนไม่ได้ และการล็อกลำดับงานไม่พังโดยไม่ต้องเขียน logic กันเพิ่ม
// ============================================================

export type FillSourceKind = "scan" | "doc";
export type FillParse = "raw" | "json" | "regex";

/** ชนิดฟิลด์ที่ยอมให้เติมอัตโนมัติได้ — ผลตรวจ/รูป/ลายเซ็นต้องทำจริงหน้างาน */
export const FILL_TARGET_TYPES: FieldType[] = ["text", "number", "datetime", "select"];

export interface FillMapEntry {
  /** ฟิลด์ปลายทาง (ต้องอยู่ step เดียวกัน) */
  field_id: string;
  /** ชื่อค่าที่จะดึง — doc: ชื่อที่ให้ AI หา · scan json: ชื่อ property · scan regex: ชื่อ named group */
  key: string;
  hint?: string;
}

export interface FillSource {
  id: string;
  label: string;
  kind: FillSourceKind;
  /** เฉพาะ kind=scan (default "raw") */
  parse?: FillParse;
  /** เฉพาะ parse=regex — ต้องมี named group ตรงกับ key */
  pattern?: string;
  /** เฉพาะ kind=doc — อธิบายเอกสารให้ AI */
  doc_hint?: string;
  /** เฉพาะ kind=doc — เก็บรูปต้นฉบับแนบ submission (default true) */
  keep_photo?: boolean;
  map: FillMapEntry[];
}

export const MAX_FILL_MAP = 12;
export const MAX_DOC_SOURCES_PER_STEP = 4;
export const MAX_SCAN_SOURCES_PER_STEP = 12;

export interface FormStep {
  id: string;
  title: string;
  fields: FormField[];
  /** แหล่งเติมข้อมูลของขั้นตอนนี้ */
  fill_sources?: FillSource[];
  /**
   * ผู้รับผิดชอบขั้นนี้ (ฟอร์มกรอกหลายคน) — ไม่ตั้ง = คนเดิมจากขั้นก่อนหน้ากรอกต่อ
   * ขั้นแรก: จำกัดว่าใครเริ่มงานได้ / ขั้นอื่น: จบขั้นก่อนหน้าแล้วงานไปกองงานของทีมนี้
   */
  assignee?: StepAssignee;
}

/** ผู้รับผิดชอบขั้นตอน: ทีม (ใครในทีมก็กดรับได้) หรือรายบุคคล (ส่งถึงคนนั้นโดยตรง) — ตั้งได้อย่างใดอย่างหนึ่ง */
export type StepAssignee = { team_id: string; user_id?: undefined } | { user_id: string; team_id?: undefined };

export interface PaperBox {
  x: number;
  y: number;
  w: number;
}

export interface FormSchema {
  title: string;
  description: string;
  icon: string;
  category?: string; // ประเภทฟอร์ม: preset key หรือข้อความกำหนดเอง
  flow: "sequential";
  steps: FormStep[];
  // แสดงชื่อเอกสาร / แสดงวันที่-เลขที่ (แยกกัน) — undefined/true = แสดง, false = ซ่อน
  show_header?: boolean;
  show_meta?: boolean;
  // ตำแหน่ง element บนมุมมองกระดาษ (px บนแคนวาส A4 กว้าง 794)
  // key = field id, "s:<stepId>" สำหรับหัวข้อขั้นตอน, "header" = หัวเอกสาร
  layout?: Record<string, PaperBox>;
  // การแสดงรูปถ่ายตอนพิมพ์/มุมมองกระดาษ — undefined = thumb (รูปย่อในช่อง เหมือนเดิม)
  print_photos?: PrintPhotos;
  // ประกาศความเป็นส่วนตัวของเจ้าของฟอร์ม (PDPA) — แสดงก่อนเริ่มกรอกฟอร์มสาธารณะ · ไม่มี = ข้อความมาตรฐาน
  privacy_notice?: string;
  /** เก็บพิกัด GPS ตอนส่ง/ถ่ายรูป — ไม่ระบุ = ปิด · required = ไม่ให้พิกัดส่งไม่ได้ */
  geo?: "optional" | "required";
  /** ประทับวันเวลา (+พิกัดถ้าเปิด GPS) + ชื่อฟอร์ม ลงรูปถ่ายตอนถ่าย */
  watermark?: boolean;
  /** หน้าตรวจทานก่อนส่ง (สรุปคำตอบทุกขั้น + ข้อไม่ผ่าน/รูปที่ขาด ก่อนกดยืนยันส่ง) — ไม่ระบุ = ส่งทันที */
  review?: boolean;
  /** เลขที่เอกสารแบบรัน (ออกตอนบันทึกใบ ฝั่งฐานข้อมูล 0077) — ไม่ระบุ = รหัส 8 ตัวจาก id */
  doc_no?: DocNoConfig;
  // ธีมสี / โลโก้ / ข้อความท้ายเอกสาร ของฟอร์มนี้ (ไม่ระบุ = ใช้ของ workspace) — ดู @/lib/theme
  theme?: FormTheme;
  // รูปประกอบบนกระดาษ (โลโก้ / ตราประทับ / รูปอธิบาย) — วางตำแหน่งใน layout ด้วย key "img:<id>"
  images?: PaperImage[];
}

/** รูปประกอบบนมุมมองกระดาษ (ไม่ใช่ช่องให้กรอก) */
export interface PaperImage {
  id: string;
  url: string;
  /** ความสูงบนกระดาษ (px ที่ 96dpi) */
  h: number;
}
export const MAX_PAPER_IMAGES = 10;
export const imageKey = (id: string) => `img:${id}`;

/**
 * การแสดงรูปถ่ายบนเอกสารกระดาษ
 * - thumb: รูปย่อในช่องของแต่ละฟิลด์ (ค่าเริ่มต้น)
 * - grid: รวมฟิลด์รูปทั้งหมดเป็น "กล่องภาพประกอบ" กล่องเดียวบนกระดาษ จัดเรียง cols รูปต่อแถว สูง height_mm
 * - appendix: รูปย่อในช่อง + หน้าภาพประกอบท้ายเอกสาร (cols รูปต่อแถว สูง height_mm) ตอนพิมพ์
 * - hidden: ไม่พิมพ์รูป (ยังถ่าย/เก็บในระบบตามปกติ)
 */
export type PrintPhotoMode = "thumb" | "grid" | "appendix" | "hidden";
export interface PrintPhotos {
  mode: PrintPhotoMode;
  cols?: number;      // 1–4 รูปต่อแถว
  height_mm?: number; // 20–120 มม.
}
export const PRINT_PHOTO_MODES: PrintPhotoMode[] = ["thumb", "grid", "appendix", "hidden"];
export const PRINT_PHOTO_DEFAULT = { cols: 3, height_mm: 45 } as const;

/** ค่าที่ใช้จริง (เติมค่าเริ่มต้น + จำกัดช่วง) */
export function printPhotosOf(schema: Pick<FormSchema, "print_photos">): Required<PrintPhotos> {
  const p = schema.print_photos;
  return {
    mode: p?.mode && PRINT_PHOTO_MODES.includes(p.mode) ? p.mode : "thumb",
    cols: Math.min(4, Math.max(1, Math.round(p?.cols ?? PRINT_PHOTO_DEFAULT.cols))),
    height_mm: Math.min(120, Math.max(20, Math.round(p?.height_mm ?? PRINT_PHOTO_DEFAULT.height_mm))),
  };
}

/** ฟิลด์รูปถ่ายทั้งหมดตามลำดับในฟอร์ม (ไม่รวมคอลัมน์รูปในตาราง) */
export function photoFieldsOf(schema: FormSchema): { field: FormField; stepIndex: number }[] {
  const out: { field: FormField; stepIndex: number }[] = [];
  schema.steps.forEach((s, si) => s.fields.forEach((f) => { if (f.type === "photo") out.push({ field: f, stepIndex: si }); }));
  return out;
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
  table: "ตาราง",
  formula: "สูตรคำนวณ",
  child_form: "ปุ่มเปิดฟอร์มลูก",
};

/** รหัสพื้นที่ — ตรงกับ check ใน workspace_areas (0072): ห้ามช่องว่าง/จุลภาค ยาวไม่เกิน 20 */
export const AREA_CODE_RE = /^[^\s,]{1,20}$/;

/** ฟิลด์พื้นที่ของฟอร์ม (มีได้ช่องเดียว) */
export function areaFieldOf(schema: FormSchema): FormField | null {
  for (const s of schema.steps) for (const f of s.fields) if (f.area) return f;
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DS_COL_RE = /^[a-z_][a-z0-9_]{0,39}$/;

/** ทำความสะอาด options_source (ไม่ตรวจว่า dataset มีจริง — ตรวจตอน resolve) */
export function sanitizeOptionsSource(raw: unknown, allowParent: boolean): OptionsSource | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const dataset_id = String(o.dataset_id ?? "");
  const column = String(o.column ?? "");
  if (!UUID_RE.test(dataset_id) || !DS_COL_RE.test(column)) return undefined;
  const out: OptionsSource = { dataset_id, column };
  const lc = String(o.label_column ?? "");
  if (lc && lc !== column && DS_COL_RE.test(lc)) out.label_column = lc;
  if (allowParent && o.parent && typeof o.parent === "object") {
    const p = o.parent as Record<string, unknown>;
    const pc = String(p.column ?? "");
    const pf = String(p.field_id ?? "").replace(/[^\w-]/g, "_").slice(0, 40);
    if (DS_COL_RE.test(pc) && pf) out.parent = { column: pc, field_id: pf };
  }
  return out;
}

const str = (v: unknown, max: number, fallback = ""): string => {
  const s = v == null ? fallback : String(v);
  return s.slice(0, max);
};
const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
};

/**
 * ทำความสะอาด fill_sources ของหนึ่ง step
 * กติกา: ฟิลด์ปลายทางต้องอยู่ step เดียวกัน, ชนิดต้องอยู่ใน FILL_TARGET_TYPES,
 *        หนึ่งฟิลด์ถูกเติมได้จากแหล่งเดียวเท่านั้น, regex ที่คอมไพล์ไม่ผ่านถูกตัดทิ้ง
 */
export function sanitizeFillSources(raw: unknown, fields: FormField[]): FillSource[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(fields.map((f) => [f.id, f]));
  const usedField = new Set<string>();
  const usedId = new Set<string>();
  const out: FillSource[] = [];
  let docCount = 0;
  let scanCount = 0;

  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const o = item as Record<string, unknown>;
    const kind: FillSourceKind = o.kind === "scan" ? "scan" : o.kind === "doc" ? "doc" : "doc";

    if (kind === "doc" && docCount >= MAX_DOC_SOURCES_PER_STEP) return;
    if (kind === "scan" && scanCount >= MAX_SCAN_SOURCES_PER_STEP) return;

    let id = str(o.id, 40, `fs${i}`).replace(/[^\w-]/g, "_") || `fs${i}`;
    while (usedId.has(id)) id = `${id}_`;

    const parse: FillParse =
      kind === "scan" && (o.parse === "json" || o.parse === "regex") ? o.parse : "raw";

    let pattern: string | undefined;
    if (kind === "scan" && parse === "regex") {
      const p = str(o.pattern, 300);
      if (!p) return;
      try {
        new RegExp(p);
      } catch {
        return; // regex ใช้ไม่ได้ → ตัดทิ้งทั้งแหล่ง ดีกว่าปล่อยให้พังตอนกรอก
      }
      pattern = p;
    }

    const rawMap = Array.isArray(o.map) ? o.map : [];
    const map: FillMapEntry[] = [];
    for (const m of rawMap) {
      if (map.length >= MAX_FILL_MAP) break;
      if (!m || typeof m !== "object") continue;
      const mo = m as Record<string, unknown>;
      const fieldId = str(mo.field_id, 40);
      const target = byId.get(fieldId);
      if (!target) continue;                                  // ไม่มีฟิลด์นี้ใน step
      if (!FILL_TARGET_TYPES.includes(target.type)) continue;  // ชนิดไม่อนุญาต
      if (usedField.has(fieldId)) continue;                    // ถูกจองโดยแหล่งอื่นแล้ว
      const key = str(mo.key, 60, target.label) || target.label;
      const entry: FillMapEntry = { field_id: fieldId, key };
      const hint = str(mo.hint, 200);
      if (hint) entry.hint = hint;
      map.push(entry);
      usedField.add(fieldId);
    }

    // scan แบบ raw ได้ค่าเดียว → ผูกได้ฟิลด์เดียว
    const finalMap = kind === "scan" && parse === "raw" ? map.slice(0, 1) : map;
    for (const dropped of map.slice(finalMap.length)) usedField.delete(dropped.field_id);
    if (finalMap.length === 0) return;

    const src: FillSource = {
      id,
      label: str(o.label, 80, kind === "scan" ? "สแกนรหัส" : "ถ่ายเอกสาร"),
      kind,
      map: finalMap,
    };
    if (kind === "scan") {
      src.parse = parse;
      if (pattern) src.pattern = pattern;
    } else {
      const dh = str(o.doc_hint, 300);
      if (dh) src.doc_hint = dh;
      src.keep_photo = o.keep_photo !== false;
    }

    usedId.add(id);
    if (kind === "doc") docCount++;
    else scanCount++;
    out.push(src);
  });

  return out;
}

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
      const legacyScan: string[] = []; // label ของฟิลด์ที่มาจาก type "barcode" เดิม
      const fields: FormField[] = rawFields
        .filter(
          (f: unknown) =>
            f &&
            typeof f === "object" &&
            FIELD_TYPES.includes((f as Record<string, unknown>).type as FieldType)
        )
        .map((f: unknown, fi: number): FormField => {
          const fo = f as Record<string, unknown>;
          // barcode เป็น alias ของ "text ที่สแกนได้" — แปลงตอนอ่าน
          // ฟอร์มเก่าและคำตอบจาก AI ยังส่ง type:"barcode" มาได้เหมือนเดิม
          const rawType = fo.type as FieldType;
          const type: FieldType = rawType === "barcode" ? "text" : rawType;
          if (rawType === "barcode") legacyScan.push(str(fo.label, 200, "ไม่ระบุ"));
          const o: FormField = {
            id: str(fo.id, 40, `f${si}_${fi}`).replace(/[^\w-]/g, "_") || `f${si}_${fi}`,
            type,
            label: str(fo.label, 200, "ไม่ระบุ"),
            required: fo.required !== false,
          };
          if (fo.width === "full" || fo.width === "half") o.width = fo.width;
          if (fo.tooltip) o.tooltip = str(fo.tooltip, 300);
          if (fo.example != null && fo.example !== "") o.example = str(fo.example, 120);
          if (type === "formula") {
            o.required = false; // คำนวณเอง ไม่มีให้กรอก
            o.formula = str(fo.formula, 500);
            const d = num(fo.decimals);
            if (d !== undefined) o.decimals = Math.min(6, Math.max(0, Math.round(d)));
          }
          if (type === "number" || type === "formula") {
            const mn = num(fo.min);
            const mx = num(fo.max);
            if (mn !== undefined) o.min = mn;
            if (mx !== undefined) o.max = mx;
            if (fo.unit) o.unit = str(fo.unit, 20);
          }
          if ((type === "select" || type === "checkbox") && Array.isArray(fo.options)) {
            o.options = fo.options.slice(0, 200).map((x) => str(x, 80));
            const fl = cleanFailOptions(fo.fail_options, o.options);
            if (fl) o.fail_options = fl;
          }
          if (type === "select" && fo.area === true) {
            // ตัวเลือกมาจากรายชื่อพื้นที่เท่านั้น — ไม่เก็บตัวเลือกที่พิมพ์เอง / ถังข้อมูล
            o.area = true;
            delete o.options;
            const d = typeof fo.area_default === "string" ? fo.area_default.trim() : "";
            if (AREA_CODE_RE.test(d)) o.area_default = d;
          } else if (type === "select" || type === "checkbox") {
            const os = sanitizeOptionsSource(fo.options_source, true);
            if (os) o.options_source = os;
          }
          if (type === "child_form") {
            o.required = false; // ปุ่ม ไม่มีคำตอบ
            const cf = sanitizeChildForm(fo.child_form);
            if (cf) o.child_form = cf;
          }
          if (type === "photo" && fo.photo_hint) o.photo_hint = str(fo.photo_hint, 200);
          if (type === "photo" && fo.required_if_fail === true && !o.required) o.required_if_fail = true;
          if (type === "photo") {
            const mx = num(fo.max_photos);
            if (mx !== undefined && mx > 1) {
              o.max_photos = Math.min(12, Math.round(mx));
              const mn = num(fo.min_photos);
              if (mn !== undefined && mn > 1) o.min_photos = Math.min(o.max_photos, Math.round(mn));
            }
            if (Array.isArray(fo.photo_labels)) {
              const max = (o.max_photos as number | undefined) ?? 1;
              const labels = fo.photo_labels.slice(0, max).map((x) => (typeof x === "string" ? x.slice(0, 80) : ""));
              if (labels.some((x) => x.trim())) o.photo_labels = labels;
            }
          }
          if (type === "pass_fail") {
            o.on_fail_require_note = fo.on_fail_require_note !== false;
            if (typeof fo.pass_label === "string" && fo.pass_label.trim()) o.pass_label = str(fo.pass_label, 30);
            if (typeof fo.fail_label === "string" && fo.fail_label.trim()) o.fail_label = str(fo.fail_label, 30);
            if (fo.allow_na === true) o.allow_na = true;
          }
          if (type === "text") {
            if (fo.long_text === true) o.long_text = true;
            if (fo.text_format === "phone" || fo.text_format === "email") o.text_format = fo.text_format;
          }
          if (type === "datetime") {
            if (fo.dt_mode === "date" || fo.dt_mode === "time") o.dt_mode = fo.dt_mode;
            if (fo.dt_no_default === true) o.dt_no_default = true;
          }
          if (type === "signature" && fo.sign_name === true) o.sign_name = true;
          if (type === "table") {
            const rawCols = Array.isArray(fo.columns) ? fo.columns : [];
            const cols: TableColumn[] = rawCols
              .slice(0, 12)
              .map((c: unknown, ci: number): TableColumn => {
                const co = (c ?? {}) as Record<string, unknown>;
                const ct = ((TABLE_COL_TYPES as readonly string[]).includes(co.type as string) ? co.type : "text") as TableColType;
                const col: TableColumn = {
                  id: str(co.id, 30, `c${ci}`).replace(/[^\w-]/g, "_") || `c${ci}`,
                  label: str(co.label, 60, `คอลัมน์ ${ci + 1}`),
                  type: ct,
                };
                if (ct === "select" && Array.isArray(co.options)) {
                  col.options = co.options.slice(0, 100).map((x) => str(x, 60));
                  const fl = cleanFailOptions(co.fail_options, col.options);
                  if (fl) col.fail_options = fl;
                }
                if (co.required === true && ct !== "formula") col.required = true;
                if (ct === "select") {
                  const os = sanitizeOptionsSource(co.options_source, false);
                  if (os) col.options_source = os;
                }
                if (ct === "formula") {
                  col.formula = str(co.formula, 300);
                  const d = num(co.decimals);
                  if (d !== undefined) col.decimals = Math.min(6, Math.max(0, Math.round(d)));
                }
                const w = num(co.width);
                if (w !== undefined && w > 0) col.width = Math.min(6, Math.max(1, Math.round(w)));
                return col;
              });
            o.columns = cols.length ? cols : [{ id: "c0", label: "รายการ", type: "text" }];
            if (fo.require_photo_on_fail === true && o.columns.some((c) => c.type === "photo")) o.require_photo_on_fail = true;
            const mr = num(fo.min_rows);
            o.min_rows = mr !== undefined ? Math.min(20, Math.max(1, Math.round(mr))) : 1;
            const xr = num(fo.max_rows);
            if (xr !== undefined && xr >= 1) o.max_rows = Math.max(o.min_rows, Math.min(500, Math.round(xr)));
          }
          return o;
        });
      const step: FormStep = {
        id: `s${si + 1}`,
        title: str(so.title, 120, `ขั้นตอนที่ ${si + 1}`),
        fields,
      };
      const asg = so.assignee as Record<string, unknown> | undefined;
      if (asg && typeof asg.team_id === "string" && UUID_RE.test(asg.team_id)) step.assignee = { team_id: asg.team_id.toLowerCase() };
      else if (asg && typeof asg.user_id === "string" && UUID_RE.test(asg.user_id)) step.assignee = { user_id: asg.user_id.toLowerCase() };

      // ฟิลด์ barcode เดิม → scan source อัตโนมัติ (1 ฟิลด์ต่อ 1 ปุ่ม)
      const auto: FillSource[] = [];
      let li = 0;
      for (const f of fields) {
        const label = legacyScan[li];
        if (label !== undefined && f.label === label && f.type === "text") {
          auto.push({
            id: `sc_${f.id}`,
            label: `สแกน ${f.label}`,
            kind: "scan",
            parse: "raw",
            map: [{ field_id: f.id, key: "value" }],
          });
          li++;
        }
      }

      const declared = sanitizeFillSources(so.fill_sources, fields);
      const taken = new Set(declared.flatMap((x) => x.map.map((m) => m.field_id)));
      const merged = [...declared, ...auto.filter((a) => !taken.has(a.map[0].field_id))];
      if (merged.length) step.fill_sources = merged;
      return step;
    })
    .filter((s) => s.fields.length > 0);

  if (steps.length === 0) throw new Error("ฟอร์มไม่มีฟิลด์ที่ใช้งานได้");

  // ฟิลด์แม่ของ dropdown ที่กรองตามกัน ต้องเป็น select/checkbox ที่อยู่ "ก่อนหน้า" ในฟอร์ม
  // (กันวงวน และให้การกรอกทีละขั้นตอนมีค่าแม่ก่อนถึงฟิลด์ลูกเสมอ)
  const seenChoice = new Set<string>();
  // ฟิลด์พื้นที่ได้ฟอร์มละ 1 ช่อง (ใบหนึ่งอยู่พื้นที่เดียว) — ช่องถัดไปกลายเป็น select ธรรมดาที่ไม่มีตัวเลือก
  let areaSeen = false;
  for (const s of steps)
    for (const f of s.fields) {
      if (f.area) {
        if (areaSeen) { delete f.area; delete f.area_default; f.options = []; }
        areaSeen = true;
      }
      // ปุ่มฟอร์มลูก: ตารางที่รับผลต้องอยู่ขั้นเดียวกัน · คอลัมน์ที่จับคู่ต้องมีจริงและเป็นชนิดที่รับค่าได้
      if (f.child_form) {
        const tbl = s.fields.find((x) => x.id === f.child_form!.table_id && x.type === "table");
        if (!tbl) { f.child_form.table_id = ""; f.child_form.map = []; }
        else {
          const okCols = new Set((tbl.columns || []).filter((c) => childSourceTypesFor(c.type).length > 0).map((c) => c.id));
          f.child_form.map = f.child_form.map.filter((m) => okCols.has(m.col));
        }
      }
      const p = f.options_source?.parent;
      if (p && !seenChoice.has(p.field_id)) delete f.options_source!.parent;
      if (f.type === "select" || f.type === "checkbox") seenChoice.add(f.id);
    }

  // เก็บ layout กระดาษ (ลากวาง) เฉพาะ key ที่ตรงกับ field id / "s:<stepId>" ที่มีจริง
  const validKeys = new Set<string>(["header", "meta", "photos"]);
  const images: PaperImage[] = [];
  if (Array.isArray(r.images)) {
    for (const im of r.images.slice(0, MAX_PAPER_IMAGES)) {
      const o = (im && typeof im === "object" ? im : {}) as Record<string, unknown>;
      const id = typeof o.id === "string" && /^[a-z0-9_-]{1,40}$/i.test(o.id) ? o.id : null;
      const url = cleanImageUrl(o.url);
      if (!id || !url || images.some((x) => x.id === id)) continue;
      images.push({ id, url, h: Math.max(16, Math.min(600, Math.round(num(o.h) ?? 80))) });
      validKeys.add(imageKey(id));
    }
  }
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
    icon: normalizeIcon(r.icon),
    flow: "sequential",
    steps,
  };
  if (r.category != null && r.category !== "") schema.category = str(r.category, 60);
  if (r.show_header === false) schema.show_header = false;
  if (r.show_meta === false) schema.show_meta = false;
  if (layout) schema.layout = layout;
  const pn = str(r.privacy_notice, 2000).trim();
  if (pn) schema.privacy_notice = pn;
  if (r.geo === "optional" || r.geo === "required") schema.geo = r.geo;
  if (r.watermark === true) schema.watermark = true;
  if (r.review === true) schema.review = true;
  const dn = sanitizeDocNo(r.doc_no);
  if (dn) schema.doc_no = dn;
  const th = sanitizeFormTheme(r.theme);
  if (th) schema.theme = th;
  if (images.length) schema.images = images;
  const pp = r.print_photos as Record<string, unknown> | undefined;
  if (pp && typeof pp === "object" && PRINT_PHOTO_MODES.includes(pp.mode as PrintPhotoMode) && pp.mode !== "thumb") {
    schema.print_photos = printPhotosOf({ print_photos: { mode: pp.mode as PrintPhotoMode, cols: num(pp.cols), height_mm: num(pp.height_mm) } });
  }
  return schema;
}

// ---------- เลขที่เอกสาร ----------
export type DocNoReset = "none" | "year" | "month";
/** ปีในเลข: be = พ.ศ. (ค่าเริ่มต้น) · ce = ค.ศ. */
export type DocNoEra = "be" | "ce";
export type DocNoConfig = { prefix: string; reset?: DocNoReset; digits?: number; era?: DocNoEra };
export const DOC_NO_RESETS: DocNoReset[] = ["none", "year", "month"];
export const DOC_NO_PREFIX_MAX = 20;

/** ตัวอักษรที่ใช้ใน prefix ได้: ไทย อังกฤษ ตัวเลข - _ / . (ไม่มีช่องว่าง) */
export function cleanDocPrefix(v: unknown): string {
  return String(v ?? "").replace(/[^0-9A-Za-z\u0E00-\u0E7F\-_/.]/g, "").slice(0, DOC_NO_PREFIX_MAX);
}

export function sanitizeDocNo(raw: unknown): DocNoConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const prefix = cleanDocPrefix(r.prefix);
  if (!prefix) return undefined;
  const out: DocNoConfig = { prefix };
  if (r.reset === "year" || r.reset === "month") out.reset = r.reset;
  const d = Math.round(Number(r.digits));
  if (Number.isFinite(d) && d >= 3 && d <= 8 && d !== 4) out.digits = d;
  if (r.era === "ce") out.era = "ce";
  return out;
}

/** ตัวอย่างเลข (ตรงกับ next_doc_no ใน 0077: ปี/เดือนตามเวลาไทย · พ.ศ. หรือ ค.ศ.) */
export function docNoPreview(cfg: DocNoConfig, n = 1, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(at);
  const y = Number(parts.find((p) => p.type === "year")?.value ?? at.getFullYear());
  const mm = parts.find((p) => p.type === "month")?.value ?? "01";
  const yy = String((y + (cfg.era === "ce" ? 0 : 543)) % 100).padStart(2, "0");
  const stem = cfg.reset === "year" ? `${cfg.prefix}${yy}-` : cfg.reset === "month" ? `${cfg.prefix}${yy}${mm}-` : cfg.prefix;
  const digits = Math.min(8, Math.max(3, cfg.digits ?? 4));
  return stem + String(n).padStart(digits, "0");
}

/** เลขที่เอกสารที่แสดง: เลขรัน ถ้ามี · ไม่มี (ใบเก่า/ฟอร์มไม่ตั้ง) = 8 ตัวแรกของ id */
export function docNoOf(sub: { id: string; doc_no?: string | null }): string {
  return sub.doc_no || String(sub.id).slice(0, 8).toUpperCase();
}

/** ชื่อไฟล์จากเลขที่เอกสาร — "/" ใช้ในชื่อไฟล์ไม่ได้ */
export function docNoFileSafe(no: string): string {
  return no.replace(/[\\/:*?"<>|\s]+/g, "_");
}

/** Content-Disposition ที่รองรับชื่อไทย (header ต้องเป็น ASCII: ชื่อสำรอง + filename* แบบ UTF-8) */
export function attachmentHeader(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Map ค่า → ชื่อที่แสดง (เฉพาะตัวเลือกที่มีชื่อ) */
export function labelMap(options?: string[], labels?: string[]): Map<string, string> {
  const m = new Map<string, string>();
  if (!options || !labels) return m;
  options.forEach((o, i) => {
    const l = labels[i];
    if (l && !m.has(o)) m.set(o, l);
  });
  return m;
}

/** dataset ทั้งหมดที่ฟอร์มนี้อ้างอิง (ฟิลด์ + คอลัมน์ตาราง) */
export function datasetIdsOf(schema: FormSchema): string[] {
  const ids = new Set<string>();
  for (const s of schema.steps)
    for (const f of s.fields) {
      if (f.options_source) ids.add(f.options_source.dataset_id);
      for (const c of f.columns || []) if (c.options_source) ids.add(c.options_source.dataset_id);
    }
  return [...ids];
}

export function countFields(schema: FormSchema): number {
  return schema.steps.reduce((n, s) => n + s.fields.length, 0);
}

// ---- helper เกี่ยวกับ fill source ----

/** แหล่งเติมข้อมูลที่ผูกกับฟิลด์นี้ (ถ้ามี) */
export function fillSourceOf(step: FormStep, fieldId: string): FillSource | undefined {
  return step.fill_sources?.find((s) => s.map.some((m) => m.field_id === fieldId));
}

/** จำนวนฟิลด์ที่ถูกเติมอัตโนมัติ (นับเฉพาะ kind ที่ระบุ ถ้าไม่ระบุ = ทุกแบบ) */
export function countDerivedFields(schema: FormSchema, kind?: FillSourceKind): number {
  return schema.steps.reduce(
    (n, s) =>
      n +
      (s.fill_sources ?? [])
        .filter((src) => !kind || src.kind === kind)
        .reduce((m, src) => m + src.map.length, 0),
    0
  );
}

/**
 * สัดส่วนฟิลด์ที่มาจาก AI อ่านเอกสาร เทียบกับฟิลด์ทั้งฟอร์ม
 * ใช้เตือนคนออกแบบฟอร์ม: ถ้าสูงเกินไปแปลว่าฟอร์มกำลังกลายเป็น "กล่องรับรูป"
 * ไม่ใช่ฟอร์มที่คุมกระบวนการ — เตือนเฉย ๆ ไม่บล็อก
 */
export function docDerivedRatio(schema: FormSchema): number {
  const total = countFields(schema);
  return total === 0 ? 0 : countDerivedFields(schema, "doc") / total;
}

export const DOC_DERIVED_WARN_RATIO = 0.5;

/** ตัวเลือกที่นับเป็นข้อบกพร่อง: ต้องเป็นตัวเลือกที่มีอยู่จริง · ไม่ซ้ำ · ว่าง = undefined */
function cleanFailOptions(raw: unknown, options: string[]): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const have = new Set(options);
  const out = [...new Set(raw.filter((x): x is string => typeof x === "string" && have.has(x)))];
  return out.length ? out : undefined;
}

/** ค่าที่เลือก (ตัวเลือกเดียวหรือหลายตัว) มีตัวที่นับเป็นข้อบกพร่องหรือไม่ */
export function isFailChoice(failOptions: string[] | undefined, value: unknown): boolean {
  if (!failOptions?.length) return false;
  if (Array.isArray(value)) return value.some((v) => typeof v === "string" && failOptions.includes(v));
  return typeof value === "string" && failOptions.includes(value);
}
