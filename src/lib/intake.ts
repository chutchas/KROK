// ============================================================
// KROK · API รับข้อมูลเข้า (intake) — ฟังก์ชันล้วน ใช้ฝั่ง server และทดสอบได้
//
// ระบบภายนอกส่ง { "<key>": ค่า } มา → แปลงเป็นคำตอบของฟอร์ม
//   key = ชื่อที่ตั้งต่อช่องในแท็บ API (field_keys) ถ้าไม่ได้ตั้งใช้รหัสช่อง (field id)
// แล้วตัดสินว่า "ครบ" (ส่งเป็นเอกสารได้เลย) หรือ "ยังไม่ครบ" (เปิดงานให้คนกรอกต่อ)
// ============================================================
import { labelMap, type FormField, type FormSchema, type TableColumn } from "@/lib/form-schema";
import { computeFormulas, formatNumber, outOfRange } from "@/lib/formula";
import { checkCode, finalizeTableRows, passFailCode } from "@/lib/table-rows";

export const INTAKE_KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
export const INTAKE_API_KEY_RE = /^kfi_[A-Za-z0-9_-]{20,}$/;

type TableRow = Record<string, string>;
export type IntakeAnswer = { value?: string | string[] | TableRow[]; note?: string; src?: "api" };

export interface IntakeFieldInfo {
  field_id: string;
  key: string;
  label: string;
  type: FormField["type"];
  required: boolean;
  step: number;
  /** รับผ่าน API ได้ไหม (รูป/ลายเซ็นไม่ได้) */
  accepts: boolean;
  unit?: string;
  options?: { value: string; label?: string }[];
  columns?: { id: string; label: string; type: string }[];
}

/** ชื่อ key ของแต่ละช่อง (ตั้งเอง หรือใช้รหัสช่อง) */
export function intakeFields(schema: FormSchema, fieldKeys: Record<string, string>): IntakeFieldInfo[] {
  const out: IntakeFieldInfo[] = [];
  schema.steps.forEach((st, si) => {
    for (const f of st.fields) {
      const info: IntakeFieldInfo = {
        field_id: f.id,
        key: fieldKeys[f.id] || f.id,
        label: f.label,
        type: f.type,
        required: !!f.required,
        step: si,
        accepts: f.type !== "photo" && f.type !== "signature",
      };
      if (f.unit) info.unit = f.unit;
      if ((f.type === "select" || f.type === "checkbox") && f.options?.length) {
        const names = labelMap(f.options, f.option_labels);
        info.options = f.options.slice(0, 200).map((o) => (names.get(o) ? { value: o, label: names.get(o) } : { value: o }));
      }
      if (f.type === "table") info.columns = (f.columns || []).map((c) => ({ id: c.id, label: c.label, type: c.type }));
      out.push(info);
    }
  });
  return out;
}

/** ตรวจชื่อ key ที่ตั้ง: รูปแบบถูก และไม่ซ้ำกัน (รวมกับรหัสช่องของช่องที่ไม่ได้ตั้ง) */
export function validateFieldKeys(schema: FormSchema, raw: unknown): { keys: Record<string, string> } | { error: string } {
  const ids = new Set(schema.steps.flatMap((s) => s.fields.map((f) => f.id)));
  const keys: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    for (const [fid, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!ids.has(fid) || typeof v !== "string") continue;
      const k = v.trim();
      if (!k) continue;
      if (!INTAKE_KEY_RE.test(k)) return { error: `ชื่อ key "${k}" ใช้ได้เฉพาะ a-z A-Z 0-9 _ . - และขึ้นต้นด้วยตัวอักษร` };
      keys[fid] = k;
    }
  }
  const seen = new Map<string, string>();
  for (const fid of ids) {
    const k = keys[fid] || fid;
    if (seen.has(k)) return { error: `ชื่อ key "${k}" ซ้ำกันหลายช่อง` };
    seen.set(k, fid);
  }
  return { keys };
}

const norm = (s: string) => s.trim().toLowerCase();

/** หาค่า (รหัส) ของตัวเลือกจากรหัสหรือชื่อที่แสดง */
function matchOption(options: string[] | undefined, labels: string[] | undefined, v: string): string | null {
  if (!options?.length) return v; // ไม่มีรายการตัวเลือก (เช่น โหลด dataset ไม่ได้) → รับตามที่ส่งมา
  if (options.includes(v)) return v;
  const n = norm(v);
  const byCode = options.find((o) => norm(o) === n);
  if (byCode) return byCode;
  if (labels) {
    const i = labels.findIndex((l) => l && norm(l) === n);
    if (i >= 0) return options[i];
  }
  return null;
}

function scalar(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return null;
}

function coerceRow(cols: TableColumn[], raw: unknown): { row?: TableRow; error?: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "แต่ละแถวต้องเป็น object" };
  const row: TableRow = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const col = cols.find((c) => c.id === k) || cols.find((c) => norm(c.label) === norm(k));
    if (!col) continue;
    const s = scalar(v);
    if (s == null || s === "") continue;
    if (col.type === "formula" || col.type === "photo") continue; // สูตรคำนวณเอง · รูปส่งผ่าน API ไม่ได้
    if (col.type === "number" && !Number.isFinite(Number(s))) return { error: `คอลัมน์ "${col.label}" ต้องเป็นตัวเลข` };
    if (col.type === "pass_fail") {
      const k = passFailCode(s);
      if (!k) return { error: `คอลัมน์ "${col.label}" ต้องเป็น "pass" หรือ "fail"` };
      row[col.id] = k;
    } else if (col.type === "checkbox") {
      if (checkCode(s)) row[col.id] = "1";
    } else if (col.type === "datetime") {
      const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
      if (!m) return { error: `คอลัมน์ "${col.label}" ต้องเป็นวันที่ YYYY-MM-DD หรือ YYYY-MM-DDTHH:mm` };
      row[col.id] = `${m[1]}T${m[2] ?? "00:00"}`;
    } else if (col.type === "select") {
      const code = matchOption(col.options, col.option_labels, s);
      if (code == null) return { error: `คอลัมน์ "${col.label}" ไม่มีตัวเลือก "${s}"` };
      row[col.id] = code;
    } else row[col.id] = s.slice(0, 2000);
  }
  return { row };
}

export interface CoerceResult {
  answers: Record<string, IntakeAnswer>;
  /** key ที่ไม่ตรงกับช่องใดในฟอร์ม */
  ignored: string[];
  errors: { key: string; error: string }[];
}

/** แปลง payload ของระบบภายนอกเป็นคำตอบของฟอร์ม */
export function coerceIntake(schema: FormSchema, fieldKeys: Record<string, string>, data: unknown): CoerceResult {
  const res: CoerceResult = { answers: {}, ignored: [], errors: [] };
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    res.errors.push({ key: "data", error: "data ต้องเป็น object { key: ค่า }" });
    return res;
  }
  const byKey = new Map<string, FormField>();
  for (const st of schema.steps) for (const f of st.fields) byKey.set(fieldKeys[f.id] || f.id, f);

  for (const [key, rawVal] of Object.entries(data as Record<string, unknown>)) {
    const f = byKey.get(key);
    if (!f) { res.ignored.push(key); continue; }
    if (rawVal == null || rawVal === "") continue;
    const err = (e: string) => res.errors.push({ key, error: e });

    switch (f.type) {
      case "formula":
        res.ignored.push(key); // ช่องสูตรคำนวณจากช่องอื่นเสมอ — ไม่รับค่าจากภายนอก
        break;
      case "photo":
      case "signature":
        err("รูปถ่าย/ลายเซ็นส่งผ่าน API ไม่ได้ — ให้คนหน้างานถ่าย/เซ็นในงาน");
        break;
      case "number": {
        const s = scalar(rawVal);
        if (s == null || !Number.isFinite(Number(s))) { err("ต้องเป็นตัวเลข"); break; }
        res.answers[f.id] = { value: s, src: "api" };
        break;
      }
      case "datetime": {
        const s = scalar(rawVal);
        const m = s?.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
        if (!m) { err("ต้องเป็นวันที่รูปแบบ YYYY-MM-DD หรือ YYYY-MM-DDTHH:mm"); break; }
        res.answers[f.id] = { value: `${m[1]}T${m[2] ?? "00:00"}`, src: "api" };
        break;
      }
      case "select": {
        const s = scalar(rawVal);
        if (s == null) { err("ต้องเป็นข้อความ"); break; }
        const code = matchOption(f.options, f.option_labels, s);
        if (code == null) { err(`ไม่มีตัวเลือก "${s}"`); break; }
        res.answers[f.id] = { value: code, src: "api" };
        break;
      }
      case "checkbox": {
        const list = Array.isArray(rawVal) ? rawVal : typeof rawVal === "string" ? rawVal.split(",") : [rawVal];
        const codes: string[] = [];
        let bad: string | null = null;
        for (const x of list) {
          const s = scalar(x)?.trim();
          if (!s) continue;
          const code = matchOption(f.options, f.option_labels, s);
          if (code == null) { bad = s; break; }
          if (!codes.includes(code)) codes.push(code);
        }
        if (bad != null) { err(`ไม่มีตัวเลือก "${bad}"`); break; }
        res.answers[f.id] = { value: codes, src: "api" };
        break;
      }
      case "pass_fail": {
        const obj = typeof rawVal === "object" && !Array.isArray(rawVal) ? (rawVal as Record<string, unknown>) : null;
        const v = obj ? obj.value : rawVal;
        const s = norm(String(v));
        const val = ["pass", "true", "ok", "ผ่าน", "1"].includes(s) ? "pass" : ["fail", "false", "ng", "ไม่ผ่าน", "0"].includes(s) ? "fail" : null;
        if (!val) { err('ต้องเป็น "pass" หรือ "fail"'); break; }
        const note = obj && typeof obj.note === "string" ? obj.note.slice(0, 1000) : undefined;
        res.answers[f.id] = note ? { value: val, note, src: "api" } : { value: val, src: "api" };
        break;
      }
      case "table": {
        if (!Array.isArray(rawVal)) { err("ต้องเป็น array ของแถว"); break; }
        const rows: TableRow[] = [];
        let bad: string | undefined;
        for (const r of rawVal.slice(0, 500)) {
          const c = coerceRow(f.columns || [], r);
          if (c.error) { bad = c.error; break; }
          if (c.row && Object.keys(c.row).length) rows.push(c.row);
        }
        if (bad) { err(bad); break; }
        res.answers[f.id] = { value: rows, src: "api" };
        break;
      }
      default: {
        const s = scalar(rawVal);
        if (s == null) { err("ต้องเป็นข้อความ"); break; }
        res.answers[f.id] = { value: s.slice(0, 5000), src: "api" };
      }
    }
  }
  return res;
}

function hasValue(f: FormField, a: IntakeAnswer | undefined): boolean {
  const v = a?.value;
  if (f.type === "table") return Array.isArray(v) && v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return v != null && v !== "";
}

/** ช่องบังคับที่ยังไม่มีค่า (รูป/ลายเซ็นที่บังคับ = ขาดเสมอ เพราะ API ส่งไม่ได้) */
export function missingRequired(schema: FormSchema, answers: Record<string, IntakeAnswer>): FormField[] {
  const out: FormField[] = [];
  for (const st of schema.steps)
    for (const f of st.fields) {
      if (!f.required) continue;
      if (!hasValue(f, answers[f.id])) { out.push(f); continue; }
      if (f.type === "pass_fail" && answers[f.id]?.value === "fail" && f.on_fail_require_note !== false && !answers[f.id]?.note?.trim()) out.push(f);
    }
  return out;
}

/**
 * รายการคำตอบของ submission (รูปแบบเดียวกับที่หน้ากรอกสร้าง) + รายการที่ไม่ผ่าน
 * ต้องตรงกับ FillWizard.submit — ส่วนรูป/ลายเซ็นไม่มีเพราะ API ส่งไม่ได้
 */
export function buildAnswerList(schema: FormSchema, answers: Record<string, IntakeAnswer>): { list: Record<string, unknown>[]; fails: string[] } {
  const list: Record<string, unknown>[] = [];
  const fails: string[] = [];
  const fvals = computeFormulas(schema, {
    value: (id) => answers[id]?.value,
    rows: (id) => (Array.isArray(answers[id]?.value) && typeof (answers[id]?.value as unknown[])[0] === "object" ? (answers[id]?.value as TableRow[]) : []),
  });
  for (const s of schema.steps)
    for (const f of s.fields) {
      const a = answers[f.id] || {};
      const item: Record<string, unknown> = { id: f.id, label: f.label, type: f.type };
      if (a.src) item.src = a.src;
      if (f.type === "photo" || f.type === "signature") {
        item.display = "—";
      } else if (f.type === "pass_fail") {
        item.display = a.value === "pass" ? "ผ่าน" : a.value === "fail" ? "ไม่ผ่าน" : "—";
        if (a.value === "fail") { item.fail = true; item.note = a.note || ""; fails.push(f.label); }
      } else if (f.type === "checkbox") {
        const vals = (Array.isArray(a.value) ? a.value : []).filter((v): v is string => typeof v === "string");
        const names = labelMap(f.options, f.option_labels);
        item.display = vals.map((v) => names.get(v) ?? v).join(", ") || "—";
        if (names.size && vals.length) item.code = vals.join(", ");
      } else if (f.type === "number") {
        item.display = String(a.value ?? "—") + (f.unit && a.value != null ? " " + f.unit : "");
        const v = parseFloat(String(a.value));
        if (Number.isFinite(v) && ((f.min != null && v < f.min) || (f.max != null && v > f.max))) { item.fail = true; fails.push(f.label + " (ค่านอกช่วง)"); }
      } else if (f.type === "formula") {
        const v = fvals[f.id] ?? null;
        item.display = v == null ? "—" : formatNumber(v, f.decimals ?? 2) + (f.unit ? " " + f.unit : "");
        if (outOfRange(v, f)) { item.fail = true; fails.push(f.label + " (ค่านอกช่วง)"); }
      } else if (f.type === "table") {
        const fin = finalizeTableRows(f, Array.isArray(a.value) ? (a.value as TableRow[]) : []);
        item.display = `${fin.rows.length} แถว`;
        item.rows = fin.rows;
        if (fin.fails.length) { item.fail = true; fails.push(...fin.fails); }
        item.columns = (f.columns || []).map((c) => ({ id: c.id, label: c.label, type: c.type }));
      } else if (f.type === "select" && typeof a.value === "string" && a.value) {
        const name = labelMap(f.options, f.option_labels).get(a.value);
        item.display = name ?? a.value;
        if (name) item.code = a.value;
      } else item.display = String(a.value ?? "—");
      list.push(item);
    }
  return { list, fails };
}

/** ชื่องานจากคำตอบช่องแรก ๆ (เหมือนชื่อร่าง) */
export function titleFromAnswers(schema: FormSchema, answers: Record<string, IntakeAnswer>): string {
  for (const st of schema.steps)
    for (const f of st.fields) {
      const v = answers[f.id]?.value;
      if (typeof v === "string" && v && ["text", "select", "number"].includes(f.type)) {
        const l = f.option_labels && f.options ? f.option_labels[f.options.indexOf(v)] : "";
        return `${f.label}: ${l || v}`.slice(0, 120);
      }
    }
  return "";
}
