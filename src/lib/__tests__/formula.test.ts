import { describe, expect, it } from "vitest";
import { computeFormulas, computeRow, evaluate, findCycles, formatNumber, fromDisplay, insertables, parseFormula, toDisplay } from "../formula";
import type { FormSchema, TableColumn } from "../form-schema";

const get = (m: Record<string, unknown>) => (id: string) => (m[id] as number | null | (number | null)[]) ?? null;

describe("formula engine", () => {
  it("ลำดับความสำคัญของเครื่องหมาย", () => {
    expect(evaluate("1 + 2 * 3", get({}))).toBe(7);
    expect(evaluate("(1 + 2) * 3", get({}))).toBe(9);
    expect(evaluate("2 ^ 3 ^ 2", get({}))).toBe(512);
    expect(evaluate("-2 ^ 2", get({}))).toBe(4);
    expect(evaluate("50%", get({}))).toBe(0.5);
    expect(evaluate("10 / 4", get({}))).toBe(2.5);
  });
  it("อ้างฟิลด์ + ค่าว่าง + หารศูนย์", () => {
    expect(evaluate("{a} * {b}", get({ a: 3, b: 4 }))).toBe(12);
    expect(evaluate("{a} + {b}", get({ a: 3, b: null }))).toBeNull();
    expect(evaluate("{a} / 0", get({ a: 3 }))).toBeNull();
  });
  it("ฟังก์ชันมาตรฐาน", () => {
    expect(evaluate("SUM({t.c})", get({ "t.c": [1, 2, null, 3] }))).toBe(6);
    expect(evaluate("AVG({t.c})", get({ "t.c": [1, 2, null, 3] }))).toBe(2);
    expect(evaluate("COUNT({t.c})", get({ "t.c": [1, null, 3] }))).toBe(2);
    expect(evaluate("MAX({a}, {b}, 7)", get({ a: 3, b: 9 }))).toBe(9);
    expect(evaluate("ROUND(2.345, 2)", get({}))).toBe(2.35);
    expect(evaluate("ROUNDUP(2.301, 1)", get({}))).toBe(2.4);
    expect(evaluate("ROUNDDOWN(-2.39, 1)", get({}))).toBe(-2.3);
    expect(evaluate("IF({a} > 5, 1, 0)", get({ a: 6 }))).toBe(1);
    expect(evaluate("IF(AND({a} >= 1, {a} <= 2), 10, 20)", get({ a: 3 }))).toBe(20);
    expect(evaluate("average({t.c})", get({ "t.c": [2, 4] }))).toBe(3);
  });
  it("สูตรผิด → ข้อความภาษาไทย", () => {
    expect(() => parseFormula("1 +")).toThrow();
    expect(() => parseFormula("FOO(1)")).toThrow(/ไม่รู้จักฟังก์ชัน/);
    expect(() => parseFormula("IF(1,2)")).toThrow(/IF ต้องมี 3/);
    expect(evaluate("{t.c} + 1", get({ "t.c": [1] }))).toBeNull(); // ทั้งคอลัมน์นอกฟังก์ชันรวม
  });
  it("ไม่มีทาง eval โค้ด", () => {
    expect(() => parseFormula("alert(1)")).toThrow();
    expect(() => parseFormula("constructor")).toThrow();
    expect(() => parseFormula("'a'")).toThrow();
  });
  it("จัดรูปแบบตัวเลข", () => {
    expect(formatNumber(1234.5678, 2)).toBe("1,234.57");
    expect(formatNumber(3, 2)).toBe("3");
    expect(formatNumber(null)).toBe("");
  });
});

const cols: TableColumn[] = [
  { id: "n", label: "ชื่อ", type: "text" },
  { id: "q", label: "จำนวน", type: "number" },
  { id: "p", label: "ราคา", type: "number" },
  { id: "tot", label: "รวม", type: "formula", formula: "{q} * {p}", decimals: 2 },
  { id: "ok", label: "ผ่าน", type: "pass_fail" },
];

const schema: FormSchema = {
  title: "t", steps: [{ id: "s1", title: "s", fields: [
    { id: "w1", type: "number", label: "น้ำหนักก่อน", required: true },
    { id: "w2", type: "number", label: "น้ำหนักหลัง", required: true },
    { id: "diff", type: "formula", label: "ผลต่าง", required: false, formula: "{w2} - {w1}", decimals: 1 },
    { id: "pct", type: "formula", label: "เปอร์เซ็นต์", required: false, formula: "{diff} / {w1} * 100", decimals: 2 },
    { id: "tb", type: "table", label: "รายการ", required: true, columns: cols },
    { id: "sum", type: "formula", label: "ยอดรวม", required: false, formula: "SUM({tb.tot})" },
    { id: "passed", type: "formula", label: "ผ่านกี่แถว", required: false, formula: "SUM({tb.ok})" },
  ] }],
} as FormSchema;

describe("computeRow / computeFormulas", () => {
  it("คอลัมน์สูตรรายแถว", () => {
    expect(computeRow(cols, { q: "3", p: "2.5" }).tot).toBe("7.5");
    expect(computeRow(cols, { q: "3" }).tot).toBe("");
  });
  it("ฟิลด์สูตรใช้ฟิลด์สูตรอื่น + รวมคอลัมน์ตาราง", () => {
    const r = computeFormulas(schema, {
      value: (id) => ({ w1: "10", w2: "12.34" } as Record<string, string>)[id],
      rows: (): Record<string, string>[] => [{ q: "2", p: "10", ok: "pass" }, { q: "1", p: "5", ok: "fail" }, {}],
    });
    expect(r.diff).toBe(2.3);
    expect(r.pct).toBe(23);
    expect(r.sum).toBe(25);
    expect(r.passed).toBe(1);
  });
  it("สูตรวนอ้างกัน → คำนวณไม่ได้ ไม่ค้าง", () => {
    const s = { title: "t", steps: [{ id: "s1", title: "s", fields: [
      { id: "a", type: "formula", label: "A", required: false, formula: "{b} + 1" },
      { id: "b", type: "formula", label: "B", required: false, formula: "{a} + 1" },
    ] }] } as FormSchema;
    expect(computeFormulas(s, { value: () => null, rows: () => [] })).toEqual({ a: null, b: null });
    expect(findCycles(s)).toEqual(["A", "B"]);
  });
});

describe("แปลงชื่อ ↔ id", () => {
  const ctx = { fields: schema.steps[0].fields, selfId: "sum" };
  it("ไป-กลับ", () => {
    const d = toDisplay("SUM({tb.tot}) + {w1}", ctx);
    expect(d).toBe("SUM([รายการ.รวม]) + [น้ำหนักก่อน]");
    expect(fromDisplay(d, ctx)).toEqual({ stored: "SUM({tb.tot}) + {w1}" });
  });
  it("ตรวจสอบ", () => {
    expect(fromDisplay("[ไม่มี] + 1", ctx)).toEqual({ error: "ไม่พบฟิลด์ [ไม่มี]" });
    expect(fromDisplay("[ยอดรวม] + 1", ctx)).toEqual({ error: "สูตรอ้างถึงฟิลด์ตัวเองไม่ได้" });
    expect(fromDisplay("[รายการ.ชื่อ]", ctx)).toEqual({ error: "คอลัมน์ [รายการ.ชื่อ] ไม่ใช่ตัวเลข" });
    expect("error" in fromDisplay("[รายการ.รวม] + 1", ctx)).toBe(true);
  });
  it("โหมดคอลัมน์", () => {
    const c = { fields: [], rowColumns: cols, selfId: "tot" };
    expect(fromDisplay("[จำนวน] * [ราคา]", c)).toEqual({ stored: "{q} * {p}" });
    expect(insertables(c).map((x) => x.label)).toEqual(["จำนวน", "ราคา", "ผ่าน"]);
  });
  it("ปุ่มแทรกของฟิลด์สูตร", () => {
    expect(insertables(ctx).map((x) => x.token)).toEqual(["[น้ำหนักก่อน]", "[น้ำหนักหลัง]", "[ผลต่าง]", "[เปอร์เซ็นต์]", "SUM([รายการ.จำนวน])", "SUM([รายการ.ราคา])", "SUM([รายการ.รวม])", "SUM([รายการ.ผ่าน])", "[ผ่านกี่แถว]"]);
  });
});

import { repairFormulas } from "../formula";
describe("repairFormulas (ผลจาก AI)", () => {
  it("เก็บสูตรที่ถูก ล้างสูตรที่อ้างผิด", () => {
    const s = { title: "t", steps: [{ id: "s1", title: "s", fields: [
      { id: "a", type: "number", label: "A", required: true },
      { id: "name", type: "text", label: "ชื่อ", required: true },
      { id: "ok", type: "formula", label: "OK", required: false, formula: "{a} * 2" },
      { id: "bad1", type: "formula", label: "B1", required: false, formula: "{nope} + 1" },
      { id: "bad2", type: "formula", label: "B2", required: false, formula: "{name} + 1" },
      { id: "bad3", type: "formula", label: "B3", required: false, formula: "{bad3} + 1" },
      { id: "t", type: "table", label: "T", required: false, columns: [
        { id: "q", label: "Q", type: "number" }, { id: "n", label: "N", type: "text" },
        { id: "x", label: "X", type: "formula", formula: "{q} * 3" },
        { id: "y", label: "Y", type: "formula", formula: "{n} * 3" },
      ] },
      { id: "sum", type: "formula", label: "S", required: false, formula: "SUM({t.x})" },
      { id: "sumbad", type: "formula", label: "SB", required: false, formula: "{t.x} + 1" },
    ] }] } as FormSchema;
    const f = repairFormulas(s).steps[0].fields;
    const by = (id: string) => f.find((x) => x.id === id)!;
    expect(by("ok").formula).toBe("{a} * 2");
    expect(by("bad1").formula).toBe("");
    expect(by("bad2").formula).toBe("");
    expect(by("bad3").formula).toBe("");
    expect(by("t").columns!.map((c) => c.formula ?? null)).toEqual([null, null, "{q} * 3", ""]);
    expect(by("sum").formula).toBe("SUM({t.x})");
    expect(by("sumbad").formula).toBe("");
  });
});
