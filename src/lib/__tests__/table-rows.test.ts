import { describe, expect, it } from "vitest";
import { finalizeTableRows } from "../table-rows";
import { sanitizePublicAnswers } from "../public-answers";
import { buildAnswerList, coerceIntake } from "../intake";
import { sanitizeSchema, type FormField, type FormSchema } from "../form-schema";

const table: FormField = {
  id: "tb", type: "table", label: "รายการ", required: true, columns: [
    { id: "n", label: "ชื่อ", type: "text" },
    { id: "q", label: "จำนวน", type: "number" },
    { id: "p", label: "ราคา", type: "number" },
    { id: "tot", label: "รวม", type: "formula", formula: "{q} * {p}" },
    { id: "ok", label: "สภาพ", type: "pass_fail" },
    { id: "chk", label: "ตรวจแล้ว", type: "checkbox" },
  ],
};
const schema = { title: "t", description: "", icon: "", flow: "sequential" as const, steps: [{ id: "s1", title: "s", fields: [
  { id: "w", type: "number", label: "น้ำหนัก", required: true, unit: "kg" },
  table,
  { id: "sum", type: "formula", label: "ยอดรวม", required: false, formula: "SUM({tb.tot}) + {w}", max: 100 },
] }] } as unknown as FormSchema;

describe("finalizeTableRows", () => {
  it("คำนวณสูตรใหม่ ตัดแถวว่าง แปลงรหัสเป็นคำ และนับแถวไม่ผ่าน", () => {
    const r = finalizeTableRows(table, [
      { n: "A", q: "2", p: "10", tot: "999", ok: "pass", chk: "1" },
      { tot: "5" }, // มีแต่ค่าสูตร = แถวว่าง
      { n: "B", q: "1", p: "3", ok: "fail" },
    ]);
    expect(r.rows).toEqual([
      { n: "A", q: "2", p: "10", tot: "20", ok: "ผ่าน", chk: "ใช่" },
      { n: "B", q: "1", p: "3", tot: "3", ok: "ไม่ผ่าน" },
    ]);
    expect(r.fails).toEqual(["รายการ แถว 2: สภาพ"]);
  });
});

describe("server recompute", () => {
  it("ฟอร์มสาธารณะ: ไม่เชื่อค่าสูตร/ผลที่ client ส่งมา", () => {
    const res = sanitizePublicAnswers(schema, [
      { label: "น้ำหนัก", type: "number", display: "50 kg" },
      { label: "รายการ", type: "table", rows: [{ n: "A", q: "2", p: "30", tot: "1", ok: "ผ่าน" }] },
      { label: "ยอดรวม", type: "formula", display: "1" },
    ], new Set());
    expect(res.answers[1].rows).toEqual([{ n: "A", q: "2", p: "30", tot: "60", ok: "ผ่าน" }]);
    expect(res.answers[2].display).toBe("110");
    expect(res.answers[2].fail).toBe(true);
    expect(res.result).toBe("fail");
  });
  it("API ภายนอก: ไม่รับค่าช่องสูตร + คอลัมน์ใหม่ + คำนวณผล", () => {
    const c = coerceIntake(schema, {}, { w: 5, sum: 999, tb: [{ ชื่อ: "A", จำนวน: 3, ราคา: 2, สภาพ: "fail", ตรวจแล้ว: true }] });
    expect(c.errors).toEqual([]);
    expect(c.ignored).toEqual(["sum"]);
    const { list, fails } = buildAnswerList(schema, c.answers);
    expect(list[1].rows).toEqual([{ n: "A", q: "3", p: "2", tot: "6", ok: "ไม่ผ่าน", chk: "ใช่" }]);
    expect(list[2].display).toBe("11");
    expect(fails).toEqual(["รายการ แถว 1: สภาพ"]);
  });
  it("sanitizeSchema เก็บสูตรและชนิดคอลัมน์ใหม่", () => {
    const s = sanitizeSchema(schema);
    const f = s.steps[0].fields;
    expect(f[2]).toMatchObject({ type: "formula", formula: "SUM({tb.tot}) + {w}", required: false, max: 100 });
    expect(f[1].columns?.map((c) => c.type)).toEqual(["text", "number", "number", "formula", "pass_fail", "checkbox"]);
    expect(f[1].columns?.[3].formula).toBe("{q} * {p}");
  });
});
