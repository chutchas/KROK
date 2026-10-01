// ============================================================
// KROK · สูตรคำนวณ (ฟิลด์สูตร + คอลัมน์สูตรในตาราง)
//
// เก็บใน schema แบบอ้างด้วย id (เปลี่ยนชื่อฟิลด์แล้วสูตรไม่พัง):
//   {fieldId}          ค่าของฟิลด์ตัวเลข/สูตร
//   {tableId.colId}    ทั้งคอลัมน์ของตาราง (ใช้ในฟังก์ชันรวม เช่น SUM)
//   {colId}            (เฉพาะคอลัมน์สูตร) ค่าของคอลัมน์อื่นในแถวเดียวกัน
// ตอนแก้ในหน้า editor แสดงเป็นชื่อ: [ชื่อฟิลด์] · [ชื่อตาราง.ชื่อคอลัมน์] · [ชื่อคอลัมน์]
//
// ไม่ใช้ eval — แยกคำ → ต้นไม้ → คำนวณเอง (ปลอดภัยทั้งฝั่งเบราว์เซอร์และ server)
// ค่าว่าง = null: บวกลบคูณหารกับค่าว่างได้ผลว่าง (ยังกรอกไม่ครบ) · ฟังก์ชันรวมข้ามค่าว่าง
// ผ่าน/ไม่ผ่าน → 1/0 · ติ๊กถูก → 1/0
// ============================================================
import type { FormField, FormSchema, TableColumn } from "@/lib/form-schema";

export const FORMULA_FUNCS = ["SUM", "AVG", "MIN", "MAX", "COUNT", "ROUND", "ROUNDUP", "ROUNDDOWN", "ABS", "SQRT", "IF", "AND", "OR", "NOT"] as const;
type Fn = (typeof FORMULA_FUNCS)[number];
const AGG: ReadonlySet<string> = new Set(["SUM", "AVG", "MIN", "MAX", "COUNT"]);
const ALIASES: Record<string, Fn> = { AVERAGE: "AVG", MEAN: "AVG" };
const ARITY: Record<Fn, [number, number]> = {
  SUM: [1, 50], AVG: [1, 50], MIN: [1, 50], MAX: [1, 50], COUNT: [1, 50],
  ROUND: [1, 2], ROUNDUP: [1, 2], ROUNDDOWN: [1, 2], ABS: [1, 1], SQRT: [1, 1],
  IF: [3, 3], AND: [1, 20], OR: [1, 20], NOT: [1, 1],
};

/** ชนิดคอลัมน์ที่เอามาคำนวณได้ */
export const NUMERIC_COL_TYPES = ["number", "formula", "pass_fail", "checkbox"] as const;
/** ชนิดฟิลด์ที่เอามาคำนวณได้ (ตาราง = อ้างรายคอลัมน์) */
export const NUMERIC_FIELD_TYPES = ["number", "formula"] as const;

// ---------- AST ----------
export type Node =
  | { t: "num"; v: number }
  | { t: "ref"; id: string } // {a} หรือ {a.b}
  | { t: "neg"; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "call"; fn: Fn; args: Node[] };

type Tok = { k: "num"; v: number } | { k: "ref"; id: string } | { k: "id"; v: string } | { k: "op"; v: string };

class FormulaError extends Error {}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new FormulaError(`ตัวเลขไม่ถูกต้องที่ "${src.slice(i, i + 6)}"`);
      out.push({ k: "num", v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === "{") {
      const end = src.indexOf("}", i);
      if (end < 0) throw new FormulaError("ขาดเครื่องหมาย }");
      const id = src.slice(i + 1, end).trim();
      if (!/^[\w-]+(\.[\w-]+)?$/.test(id)) throw new FormulaError(`อ้างอิงไม่ถูกต้อง {${id}}`);
      out.push({ k: "ref", id });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(src.slice(i))!;
      out.push({ k: "id", v: m[0].toUpperCase() });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "<>", "!=", "=="].includes(two)) { out.push({ k: "op", v: two === "!=" ? "<>" : two === "==" ? "=" : two }); i += 2; continue; }
    if ("+-*/^(),<>=%".includes(c)) { out.push({ k: "op", v: c === "×" ? "*" : c }); i++; continue; }
    if (c === "×") { out.push({ k: "op", v: "*" }); i++; continue; }
    if (c === "÷") { out.push({ k: "op", v: "/" }); i++; continue; }
    if (c === "[") throw new FormulaError("ไม่พบชื่อฟิลด์ที่อยู่ใน [ ]");
    throw new FormulaError(`ใช้อักขระ "${c}" ในสูตรไม่ได้`);
  }
  return out;
}

/** แยกสูตร (รูปแบบที่เก็บ — อ้างด้วย {id}) เป็นต้นไม้ · ผิดรูปแบบ → throw พร้อมข้อความภาษาไทย */
export function parseFormula(src: string): Node {
  const toks = tokenize(src);
  if (!toks.length) throw new FormulaError("ยังไม่ได้ใส่สูตร");
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = toks[p]; return !!t && t.k === "op" && t.v === v; };
  const expect = (v: string) => { if (!isOp(v)) throw new FormulaError(`ขาด "${v}"`); p++; };

  // ลำดับ: เปรียบเทียบ < บวกลบ < คูณหาร < ยกกำลัง < เครื่องหมายลบ
  const cmp = (): Node => {
    let a = add();
    while (peek()?.k === "op" && ["<", ">", "<=", ">=", "=", "<>"].includes((peek() as { v: string }).v)) {
      const op = (toks[p++] as { v: string }).v;
      a = { t: "bin", op, a, b: add() };
    }
    return a;
  };
  const add = (): Node => {
    let a = mul();
    while (isOp("+") || isOp("-")) { const op = (toks[p++] as { v: string }).v; a = { t: "bin", op, a, b: mul() }; }
    return a;
  };
  const mul = (): Node => {
    let a = pow();
    while (isOp("*") || isOp("/")) { const op = (toks[p++] as { v: string }).v; a = { t: "bin", op, a, b: pow() }; }
    return a;
  };
  const pow = (): Node => {
    const a = unary();
    if (isOp("^")) { p++; return { t: "bin", op: "^", a, b: pow() }; }
    return a;
  };
  const unary = (): Node => {
    if (isOp("-")) { p++; return { t: "neg", a: unary() }; }
    if (isOp("+")) { p++; return unary(); }
    return postfix();
  };
  const postfix = (): Node => {
    let a = atom();
    while (isOp("%")) { p++; a = { t: "bin", op: "/", a, b: { t: "num", v: 100 } }; }
    return a;
  };
  const atom = (): Node => {
    const t = toks[p];
    if (!t) throw new FormulaError("สูตรจบไม่สมบูรณ์");
    if (t.k === "num") { p++; return { t: "num", v: t.v }; }
    if (t.k === "ref") { p++; return { t: "ref", id: t.id }; }
    if (t.k === "id") {
      p++;
      const name = (ALIASES[t.v] ?? t.v) as Fn;
      if (!FORMULA_FUNCS.includes(name)) throw new FormulaError(`ไม่รู้จักฟังก์ชัน ${t.v}`);
      expect("(");
      const args: Node[] = [];
      if (!isOp(")")) {
        args.push(cmp());
        while (isOp(",")) { p++; args.push(cmp()); }
      }
      expect(")");
      const [lo, hi] = ARITY[name];
      if (args.length < lo || args.length > hi) throw new FormulaError(lo === hi ? `${name} ต้องมี ${lo} ค่า` : `${name} ต้องมี ${lo}–${hi} ค่า`);
      return { t: "call", fn: name, args };
    }
    if (t.v === "(") { p++; const e = cmp(); expect(")"); return e; }
    throw new FormulaError(`ไม่คาดว่าจะเจอ "${t.v}"`);
  };

  const ast = cmp();
  if (p < toks.length) {
    const t = toks[p];
    throw new FormulaError(`ไม่คาดว่าจะเจอ "${t.k === "num" ? t.v : t.k === "ref" ? "{" + t.id + "}" : t.v}"`);
  }
  return ast;
}

export function refsOf(n: Node, out: Set<string> = new Set()): Set<string> {
  if (n.t === "ref") out.add(n.id);
  else if (n.t === "neg") refsOf(n.a, out);
  else if (n.t === "bin") { refsOf(n.a, out); refsOf(n.b, out); }
  else if (n.t === "call") n.args.forEach((a) => refsOf(a, out));
  return out;
}

// ---------- คำนวณ ----------
type Val = number | null | (number | null)[];
export type Resolver = (id: string) => Val;

const scalar = (v: Val): number | null => {
  if (Array.isArray(v)) throw new FormulaError("ใช้ทั้งคอลัมน์ได้เฉพาะใน SUM / AVG / MIN / MAX / COUNT");
  return v;
};
const flat = (vs: Val[]): number[] => vs.flatMap((v) => (Array.isArray(v) ? v : [v])).filter((x): x is number => x != null && Number.isFinite(x));
const roundTo = (x: number, d: number, mode: "r" | "u" | "d") => {
  const k = Math.pow(10, Math.max(0, Math.min(10, Math.trunc(d))));
  const y = x * k;
  const r = mode === "r" ? Math.round(y + (y >= 0 ? 1e-9 : -1e-9)) : mode === "u" ? (y >= 0 ? Math.ceil(y - 1e-9) : Math.floor(y + 1e-9)) : Math.trunc(y);
  return r / k;
};

export function evalNode(n: Node, get: Resolver): Val {
  switch (n.t) {
    case "num": return n.v;
    case "ref": return get(n.id);
    case "neg": { const a = scalar(evalNode(n.a, get)); return a == null ? null : -a; }
    case "bin": {
      const a = scalar(evalNode(n.a, get));
      const b = scalar(evalNode(n.b, get));
      if (a == null || b == null) return null;
      switch (n.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return b === 0 ? null : a / b;
        case "^": { const r = Math.pow(a, b); return Number.isFinite(r) ? r : null; }
        case "<": return a < b ? 1 : 0;
        case ">": return a > b ? 1 : 0;
        case "<=": return a <= b ? 1 : 0;
        case ">=": return a >= b ? 1 : 0;
        case "=": return Math.abs(a - b) < 1e-9 ? 1 : 0;
        case "<>": return Math.abs(a - b) >= 1e-9 ? 1 : 0;
      }
      return null;
    }
    case "call": {
      if (AGG.has(n.fn)) {
        const xs = flat(n.args.map((a) => evalNode(a, get)));
        if (n.fn === "COUNT") return xs.length;
        if (n.fn === "SUM") return xs.reduce((s, x) => s + x, 0);
        if (!xs.length) return null;
        if (n.fn === "AVG") return xs.reduce((s, x) => s + x, 0) / xs.length;
        return n.fn === "MIN" ? Math.min(...xs) : Math.max(...xs);
      }
      if (n.fn === "IF") {
        const c = scalar(evalNode(n.args[0], get));
        if (c == null) return null;
        return scalar(evalNode(n.args[c !== 0 ? 1 : 2], get));
      }
      const vs = n.args.map((a) => scalar(evalNode(a, get)));
      if (n.fn === "AND") return vs.some((v) => v == null) ? null : vs.every((v) => v !== 0) ? 1 : 0;
      if (n.fn === "OR") return vs.some((v) => v != null && v !== 0) ? 1 : vs.some((v) => v == null) ? null : 0;
      const [x, d] = vs;
      if (x == null) return null;
      switch (n.fn) {
        case "NOT": return x === 0 ? 1 : 0;
        case "ABS": return Math.abs(x);
        case "SQRT": return x < 0 ? null : Math.sqrt(x);
        case "ROUND": return roundTo(x, d ?? 0, "r");
        case "ROUNDUP": return roundTo(x, d ?? 0, "u");
        case "ROUNDDOWN": return roundTo(x, d ?? 0, "d");
      }
      return null;
    }
  }
}

/** คำนวณสูตรที่เก็บไว้ (ผิดรูปแบบ/ผลไม่ใช่ตัวเลข → null) */
export function evaluate(stored: string | undefined, get: Resolver): number | null {
  if (!stored || !stored.trim()) return null;
  try {
    const v = evalNode(parseFormula(stored), get);
    const s = Array.isArray(v) ? null : v;
    return s != null && Number.isFinite(s) ? s : null;
  } catch {
    return null;
  }
}

// ---------- แปลงค่าที่กรอกเป็นตัวเลข ----------
export function toNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const s = raw.replace(/,/g, "").trim();
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
/** ค่าในช่องตาราง → ตัวเลขตามชนิดคอลัมน์ */
export function cellNumber(col: Pick<TableColumn, "type">, raw: unknown): number | null {
  if (col.type === "pass_fail") return raw === "pass" || raw === "ผ่าน" ? 1 : raw === "fail" || raw === "ไม่ผ่าน" ? 0 : null;
  if (col.type === "checkbox") return raw === "1" || raw === "true" || raw === true || raw === "ใช่" ? 1 : 0;
  if (col.type === "number" || col.type === "formula") return toNumber(raw);
  return null;
}

export function formatNumber(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "";
  const d = Math.max(0, Math.min(6, Math.trunc(decimals)));
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });
}

// ---------- คำนวณทั้งแถว / ทั้งฟอร์ม ----------
/** ลำดับคำนวณตาม dependency (ตัวที่วนอ้างกันเองถูกตัดออก = คำนวณไม่ได้) */
function topo<T extends { id: string }>(items: T[], deps: (x: T) => string[]): T[] {
  const byId = new Map(items.map((x) => [x.id, x]));
  const state = new Map<string, 1 | 2>();
  const out: T[] = [];
  const bad = new Set<string>();
  const visit = (x: T, stack: string[]): boolean => {
    const s = state.get(x.id);
    if (s === 2) return !bad.has(x.id);
    if (s === 1) { stack.slice(stack.indexOf(x.id)).forEach((id) => bad.add(id)); return false; }
    state.set(x.id, 1);
    let ok = true;
    for (const d of deps(x)) { const y = byId.get(d); if (y && !visit(y, [...stack, x.id])) ok = false; }
    state.set(x.id, 2);
    if (!ok) bad.add(x.id);
    else out.push(x);
    return ok;
  };
  items.forEach((x) => visit(x, [x.id]));
  return out.filter((x) => !bad.has(x.id));
}

const depsOf = (stored?: string): string[] => {
  if (!stored) return [];
  try { return Array.from(refsOf(parseFormula(stored))).map((r) => r.split(".")[0]); } catch { return []; }
};

/** แถวตาราง → แถวที่เติมค่าคอลัมน์สูตรแล้ว (เก็บเป็นข้อความที่จัดรูปแบบตามทศนิยม) */
export function computeRow(columns: TableColumn[], row: Record<string, string>): Record<string, string> {
  const fcols = columns.filter((c) => c.type === "formula");
  if (!fcols.length) return row;
  const out = { ...row };
  const colById = new Map(columns.map((c) => [c.id, c]));
  const nums = new Map<string, number | null>();
  for (const c of columns) if (c.type !== "formula") nums.set(c.id, cellNumber(c, row[c.id]));
  const ordered = topo(fcols, (c) => depsOf(c.formula));
  for (const c of fcols) { nums.set(c.id, null); out[c.id] = ""; }
  for (const c of ordered) {
    const v = evaluate(c.formula, (id) => (colById.has(id) ? nums.get(id) ?? null : null));
    const r = v == null ? null : roundTo(v, c.decimals ?? 2, "r");
    nums.set(c.id, r);
    out[c.id] = formatNumber(r, c.decimals ?? 2).replace(/,/g, "");
  }
  return out;
}

export interface FormulaInputs {
  /** ค่าดิบของฟิลด์ (ตัวเลข = string/number) */
  value: (fieldId: string) => unknown;
  /** แถวของฟิลด์ตาราง */
  rows: (fieldId: string) => Record<string, string>[];
}

/** คำนวณฟิลด์สูตรทั้งฟอร์ม → { fieldId: ผล } (ปัดทศนิยมตามที่ตั้งแล้ว) */
export function computeFormulas(schema: FormSchema, inp: FormulaInputs): Record<string, number | null> {
  const fields = schema.steps.flatMap((s) => s.fields);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const formulas = fields.filter((f) => f.type === "formula");
  const out: Record<string, number | null> = {};
  if (!formulas.length) return out;
  const rowCache = new Map<string, Record<string, string>[]>();
  const rowsOf = (f: FormField) => {
    let r = rowCache.get(f.id);
    if (!r) { r = (inp.rows(f.id) || []).map((x) => computeRow(f.columns || [], x)); rowCache.set(f.id, r); }
    return r;
  };
  const get: Resolver = (id) => {
    const [fid, cid] = id.split(".");
    const f = byId.get(fid);
    if (!f) return null;
    if (cid) {
      const col = f.type === "table" ? f.columns?.find((c) => c.id === cid) : undefined;
      if (!col) return null;
      return rowsOf(f).filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== "")).map((r) => cellNumber(col, r[cid]));
    }
    if (f.type === "formula") return out[fid] ?? null;
    if (f.type === "number") return toNumber(inp.value(fid));
    return null;
  };
  for (const f of formulas) out[f.id] = null;
  for (const f of topo(formulas, (x) => depsOf(x.formula))) {
    const v = evaluate(f.formula, get);
    out[f.id] = v == null ? null : roundTo(v, f.decimals ?? 2, "r");
  }
  return out;
}

/** ค่าอยู่นอกเกณฑ์ (ต่ำสุด–สูงสุด) หรือไม่ */
export function outOfRange(v: number | null, f: { min?: number; max?: number }): boolean {
  return v != null && ((f.min != null && v < f.min) || (f.max != null && v > f.max));
}

// ---------- แปลง id ↔ ชื่อ สำหรับหน้า editor ----------
export interface FormulaCtx {
  /** ฟิลด์ทั้งฟอร์ม (สำหรับฟิลด์สูตร) */
  fields: Pick<FormField, "id" | "label" | "type" | "columns">[];
  /** คอลัมน์ของตารางเดียวกัน (สำหรับคอลัมน์สูตร) — มีค่า = โหมดสูตรรายแถว */
  rowColumns?: Pick<TableColumn, "id" | "label" | "type">[];
  /** id ของตัวเอง (กันอ้างตัวเอง) */
  selfId?: string;
}

const clean = (s: string) => s.replace(/[[\]{}]/g, "").trim();

/** รายการที่แทรกได้ (ปุ่มลัด) */
export function insertables(ctx: FormulaCtx): { label: string; token: string; group: "field" | "column" }[] {
  if (ctx.rowColumns) {
    return ctx.rowColumns
      .filter((c) => c.id !== ctx.selfId && (NUMERIC_COL_TYPES as readonly string[]).includes(c.type))
      .map((c) => ({ label: clean(c.label), token: `[${clean(c.label)}]`, group: "column" as const }));
  }
  const out: { label: string; token: string; group: "field" | "column" }[] = [];
  for (const f of ctx.fields) {
    if (f.id === ctx.selfId) continue;
    if ((NUMERIC_FIELD_TYPES as readonly string[]).includes(f.type)) out.push({ label: clean(f.label), token: `[${clean(f.label)}]`, group: "field" });
    if (f.type === "table")
      for (const c of f.columns || [])
        if ((NUMERIC_COL_TYPES as readonly string[]).includes(c.type))
          out.push({ label: `${clean(f.label)}.${clean(c.label)}`, token: `SUM([${clean(f.label)}.${clean(c.label)}])`, group: "column" });
  }
  return out;
}

/** สูตรที่เก็บ ({id}) → ข้อความที่แสดงในช่องแก้ ([ชื่อ]) */
export function toDisplay(stored: string | undefined, ctx: FormulaCtx): string {
  if (!stored) return "";
  return stored.replace(/\{([\w-]+)(?:\.([\w-]+))?\}/g, (m, a: string, b?: string) => {
    if (ctx.rowColumns) {
      const c = ctx.rowColumns.find((x) => x.id === a);
      return c ? `[${clean(c.label)}]` : m;
    }
    const f = ctx.fields.find((x) => x.id === a);
    if (!f) return m;
    if (!b) return `[${clean(f.label)}]`;
    const c = f.columns?.find((x) => x.id === b);
    return c ? `[${clean(f.label)}.${clean(c.label)}]` : m;
  });
}

/** ข้อความในช่องแก้ ([ชื่อ]) → สูตรที่เก็บ ({id}) + ตรวจความถูกต้อง */
export function fromDisplay(display: string, ctx: FormulaCtx): { stored: string } | { error: string } {
  let err: string | null = null;
  const stored = display.replace(/\[([^\]]*)\]/g, (_m, name: string) => {
    const n = name.trim();
    if (ctx.rowColumns) {
      const c = ctx.rowColumns.find((x) => clean(x.label) === n);
      if (!c) { err ??= `ไม่พบคอลัมน์ [${n}]`; return "0"; }
      if (c.id === ctx.selfId) { err ??= "สูตรอ้างถึงคอลัมน์ตัวเองไม่ได้"; return "0"; }
      if (!(NUMERIC_COL_TYPES as readonly string[]).includes(c.type)) { err ??= `คอลัมน์ [${n}] ไม่ใช่ตัวเลข`; return "0"; }
      return `{${c.id}}`;
    }
    const f = ctx.fields.find((x) => clean(x.label) === n);
    if (f) {
      if (f.id === ctx.selfId) { err ??= "สูตรอ้างถึงฟิลด์ตัวเองไม่ได้"; return "0"; }
      if (!(NUMERIC_FIELD_TYPES as readonly string[]).includes(f.type)) { err ??= `ฟิลด์ [${n}] ไม่ใช่ตัวเลข`; return "0"; }
      return `{${f.id}}`;
    }
    // [ตาราง.คอลัมน์] — ชื่ออาจมีจุด จึงลองทุกตำแหน่งที่แบ่งได้
    for (let i = n.indexOf("."); i > 0; i = n.indexOf(".", i + 1)) {
      const t = ctx.fields.find((x) => x.type === "table" && clean(x.label) === n.slice(0, i).trim());
      const c = t?.columns?.find((x) => clean(x.label) === n.slice(i + 1).trim());
      if (t && c) {
        if (!(NUMERIC_COL_TYPES as readonly string[]).includes(c.type)) { err ??= `คอลัมน์ [${n}] ไม่ใช่ตัวเลข`; return "0"; }
        return `{${t.id}.${c.id}}`;
      }
    }
    err ??= `ไม่พบฟิลด์ [${n}]`;
    return "0";
  });
  if (err) return { error: err };
  if (!stored.trim()) return { stored: "" };
  try {
    const ast = parseFormula(stored);
    // ทั้งคอลัมน์ต้องอยู่ในฟังก์ชันรวม: ลองคำนวณด้วยค่าสมมติ จับ error การใช้ผิดที่
    evalNode(ast, (id) => (id.includes(".") ? [1] : 1));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "สูตรไม่ถูกต้อง" };
  }
  return { stored };
}

/** ตรวจสูตรวนอ้างกัน (ฟิลด์สูตร A ใช้ B และ B ใช้ A) → ชื่อฟิลด์ที่วน */
export function findCycles(schema: FormSchema): string[] {
  const fs = schema.steps.flatMap((s) => s.fields).filter((f) => f.type === "formula");
  const ok = new Set(topo(fs, (x) => depsOf(x.formula)).map((f) => f.id));
  return fs.filter((f) => !ok.has(f.id)).map((f) => f.label);
}
