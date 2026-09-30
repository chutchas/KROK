import { describe, it, expect } from "vitest";
import { answerKeys, collectColumns, answerCell, answersByKey, sheetName } from "@/lib/report-columns";
import type { AnswerItem } from "@/lib/answer-item";

const newer: AnswerItem[] = [
  { label: "ลูกค้า", type: "select", display: "บริษัท ก", code: "C001" },
  { label: "หมายเหตุ", type: "text", display: "a" },
  { label: "หมายเหตุ", type: "text", display: "b" },
  { label: "ตรวจยาง", type: "pass_fail", display: "ไม่ผ่าน", note: "ดอกยางสึก", fail: true },
  { label: "รายการ", type: "table", display: "2 แถว", columns: [{ id: "sku", label: "สินค้า" }, { id: "q", label: "จำนวน" }], rows: [{ sku: "น็อต", "sku#code": "P1", q: "3" }, { sku: "สกรู", q: "5" }] },
  { label: "รูปหน้างาน", type: "photo", photoField: "f9" },
];
const older: AnswerItem[] = [
  { label: "ลูกค้า", type: "select", display: "บริษัท ข" },
  { label: "ชื่อเก่า", type: "text", display: "x" },
];

describe("report-columns", () => {
  it("label ซ้ำแยกด้วยลำดับ", () => {
    expect(answerKeys(newer).slice(0, 3)).toEqual(["ลูกค้า", "หมายเหตุ", "หมายเหตุ (2)"]);
  });
  it("รวมคอลัมน์ตามลำดับที่พบ (ใหม่ก่อน) และรู้ว่าช่องไหนมีรหัส", () => {
    const { columns, tables } = collectColumns([newer, older]);
    expect(columns.map((c) => c.key)).toEqual(["ลูกค้า", "หมายเหตุ", "หมายเหตุ (2)", "ตรวจยาง", "รายการ", "รูปหน้างาน", "ชื่อเก่า"]);
    expect(columns.find((c) => c.key === "ลูกค้า")!.hasCode).toBe(true);
    expect(columns.find((c) => c.key === "หมายเหตุ")!.hasCode).toBe(false);
    expect(tables).toHaveLength(1);
    expect(tables[0].columns).toEqual([{ id: "sku", label: "สินค้า", hasCode: true }, { id: "q", label: "จำนวน", hasCode: false }]);
  });
  it("ค่าในเซลล์: รวมหมายเหตุ, รูป, ว่าง", () => {
    const m = answersByKey(newer);
    expect(answerCell(m.get("ตรวจยาง"))).toBe("ไม่ผ่าน — ดอกยางสึก");
    expect(answerCell(m.get("รูปหน้างาน"))).toBe("มีรูป");
    expect(answerCell({ label: "x", type: "text", display: "—" })).toBe("");
    expect(answerCell(undefined)).toBe("");
  });
  it("ชื่อชีตไม่เกิน 31 ตัว ไม่มีอักขระต้องห้าม ไม่ซ้ำ", () => {
    const used = new Set<string>(["รายงาน"]);
    expect(sheetName("a/b:c", used)).toBe("a b c");
    const long = "ก".repeat(40);
    const n1 = sheetName(long, used);
    const n2 = sheetName(long, used);
    expect(n1.length).toBeLessThanOrEqual(31);
    expect(n2).not.toBe(n1);
    expect(sheetName("รายงาน", used)).not.toBe("รายงาน");
  });
});
