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
export const TABLE_COL_TYPES = ["text", "number", "select", "formula", "pass_fail", "checkbox", "datetime", "scan"] as const;
export type TableColType = (typeof TABLE_COL_TYPES)[number];
export interface TableColumn {
  id: string;
  label: string;
  type: TableColType;
  options?: string[]; // เฉพาะ select
  options_source?: OptionsSource; // เฉพาะ select — ตัวเลือกจาก dataset
  option_labels?: string[];       // runtime เท่านั้น: ชื่อที่แสดงของแต่ละตัวเลือก (ขนานกับ options)
  width?: number;     // น้ำหนักความกว้างสัมพัทธ์ (>=1) default 1
  /** เฉพาะ formula — สูตรรายแถว อ้างคอลัมน์อื่นด้วย {colId} (ดู lib/formula.ts) */
  formula?: string;
  /** เฉพาะ formula — ทศนิยม (default 2) */
  decimals?: number;
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
  // ความกว้างในหน้ากระดาษ: full = เต็มแถว, half = ครึ่งแถว (default ปฏิบัติเหมือน half)
  width?: "full" | "half";
  // photo
  photo_hint?: string;
  // pass_fail
  on_fail_require_note?: boolean;
  // table
  columns?: TableColumn[];
  min_rows?: number; // จำนวนแถวเริ่มต้นที่แสดงตอนกรอก (default 1)
}

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
};

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
            o.options = fo.options.slice(0, 12).map((x) => str(x, 80));
          }
          if (type === "select" || type === "checkbox") {
            const os = sanitizeOptionsSource(fo.options_source, true);
            if (os) o.options_source = os;
          }
          if (type === "photo" && fo.photo_hint) o.photo_hint = str(fo.photo_hint, 200);
          if (type === "pass_fail") o.on_fail_require_note = fo.on_fail_require_note !== false;
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
                if (ct === "select" && Array.isArray(co.options)) col.options = co.options.slice(0, 20).map((x) => str(x, 60));
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
            const mr = num(fo.min_rows);
            o.min_rows = mr !== undefined ? Math.min(20, Math.max(1, Math.round(mr))) : 1;
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
  for (const s of steps)
    for (const f of s.fields) {
      const p = f.options_source?.parent;
      if (p && !seenChoice.has(p.field_id)) delete f.options_source!.parent;
      if (f.type === "select" || f.type === "checkbox") seenChoice.add(f.id);
    }

  // เก็บ layout กระดาษ (ลากวาง) เฉพาะ key ที่ตรงกับ field id / "s:<stepId>" ที่มีจริง
  const validKeys = new Set<string>(["header", "meta"]);
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
  return schema;
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
