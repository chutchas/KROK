import { describe, it, expect } from "vitest";
import { sanitizeSchema, isFailChoice, type FormField, type FormSchema } from "@/lib/form-schema";
import { finalizeTableRows, failRowsMissingPhoto } from "@/lib/table-rows";
import { sanitizePublicAnswers } from "@/lib/public-answers";
import { buildAnswerList } from "@/lib/intake";
import { buildEvidence } from "@/lib/approval-queue";

const goods: FormField = {
  id: "items", type: "table", label: "รายการสินค้า", required: true, require_photo_on_fail: true, columns: [
    { id: "name", label: "ชื่อสินค้า", type: "text" },
    { id: "cond", label: "สภาพ", type: "select", options: ["ปกติ", "ชำรุด", "ขาด"], fail_options: ["ชำรุด", "ขาด"] },
    { id: "pic", label: "รูป", type: "photo" },
  ],
};
const schema = { title: "รับสินค้า", description: "", icon: "", flow: "sequential", steps: [{ id: "s1", title: "s", fields: [
  goods,
  { id: "grade", type: "select", label: "เกรด", required: true, options: ["A", "B", "C"], fail_options: ["C"] },
  { id: "issues", type: "checkbox", label: "ปัญหาที่พบ", required: false, options: ["ฉลากหลุด", "กล่องบุบ", "ไม่มี"], fail_options: ["กล่องบุบ"] },
] }] } as unknown as FormSchema;

describe("fail_options (ตัวเลือกที่นับเป็นข้อบกพร่อง)", () => {
  it("sanitizeSchema เก็บเฉพาะตัวเลือกที่มีจริง และตาราง require_photo_on_fail ต้องมีคอลัมน์รูป", () => {
    const s = sanitizeSchema({ ...schema, steps: [{ title: "s", fields: [
      { ...goods, columns: [{ id: "cond", label: "สภาพ", type: "select", options: ["ปกติ", "ชำรุด"], fail_options: ["ชำรุด", "ไม่มีจริง", 5] }] },
      { id: "g", type: "select", label: "เกรด", options: ["A", "C"], fail_options: ["C", "C"] },
    ] }] });
    const [tb, g] = s.steps[0].fields;
    expect(tb.columns?.[0].fail_options).toEqual(["ชำรุด"]);
    expect(tb.require_photo_on_fail).toBeUndefined(); // ไม่มีคอลัมน์รูป
    expect(g.fail_options).toEqual(["C"]);
  });

  it("isFailChoice รองรับค่าเดียวและหลายค่า", () => {
    expect(isFailChoice(["ชำรุด"], "ชำรุด")).toBe(true);
    expect(isFailChoice(["ชำรุด"], ["ปกติ", "ชำรุด"])).toBe(true);
    expect(isFailChoice(["ชำรุด"], "ปกติ")).toBe(false);
    expect(isFailChoice(undefined, "ชำรุด")).toBe(false);
  });

  it("ตาราง: แถวที่เลือก ชำรุด/ขาด = ไม่ผ่าน", () => {
    const r = finalizeTableRows(goods, [{ name: "A", cond: "ปกติ" }, { name: "B", cond: "ชำรุด" }, { name: "C", cond: "ขาด" }]);
    expect(r.fails).toEqual(["รายการสินค้า แถว 2: สภาพ", "รายการสินค้า แถว 3: สภาพ"]);
  });

  it("แถวที่ไม่ผ่านต้องมีรูป (เลขแถวนับเฉพาะแถวที่มีข้อมูล)", () => {
    const rows: Record<string, string>[] = [{ name: "A", cond: "ปกติ" }, {}, { name: "B", cond: "ชำรุด" }, { name: "C", cond: "ขาด", "pic#photo": "items.pic.abc123" }];
    expect(failRowsMissingPhoto(goods, rows, (k) => k === "items.pic.abc123")).toEqual([2]);
    expect(failRowsMissingPhoto({ ...goods, require_photo_on_fail: undefined }, rows, () => false)).toEqual([]);
  });

  it("server ตัดสินซ้ำ: ฟิลด์ตัวเลือก/ติ๊ก/ตาราง ที่เลือกข้อบกพร่อง → ใบไม่ผ่าน", () => {
    const r = sanitizePublicAnswers(schema, [
      { label: "รายการสินค้า", type: "table", rows: [{ name: "B", cond: "ชำรุด" }] },
      { label: "เกรด", type: "select", display: "C" },
      { label: "ปัญหาที่พบ", type: "checkbox", display: "ฉลากหลุด,กล่องบุบ" },
    ], new Set());
    expect(r.result).toBe("fail");
    expect(r.fails).toEqual(["รายการสินค้า แถว 1: สภาพ", "เกรด", "ปัญหาที่พบ"]);
    expect((r.answers[0].columns as unknown[] | undefined)?.[1]).toMatchObject({ id: "cond", fail_options: ["ชำรุด", "ขาด"] });
  });

  it("ไม่เลือกข้อบกพร่อง = ผ่าน", () => {
    const r = sanitizePublicAnswers(schema, [
      { label: "รายการสินค้า", type: "table", rows: [{ name: "B", cond: "ปกติ" }] },
      { label: "เกรด", type: "select", display: "A" },
      { label: "ปัญหาที่พบ", type: "checkbox", display: "ไม่มี" },
    ], new Set());
    expect(r.result).toBe("pass");
  });

  it("API intake ใช้กฎเดียวกัน", () => {
    const { fails } = buildAnswerList(schema, { grade: { value: "C" }, issues: { value: ["กล่องบุบ"] }, items: { value: [{ name: "x", cond: "ขาด" }] } });
    expect(fails).toEqual(["รายการสินค้า แถว 1: สภาพ", "เกรด", "ปัญหาที่พบ"]);
  });

  it("หน้าอนุมัติบอกแถวที่ชำรุด", () => {
    const ev = buildEvidence([{ label: "รายการสินค้า", type: "table", fail: true,
      columns: [{ id: "name", label: "ชื่อสินค้า", type: "text" }, { id: "cond", label: "สภาพ", type: "select", fail_options: ["ชำรุด"] }],
      rows: [{ name: "A", cond: "ปกติ" }, { name: "B", cond: "ชำรุด" }] }]);
    expect(ev.failed[0].details).toEqual(["แถว 2: สภาพ"]);
  });
});
