import { describe, it, expect } from "vitest";
import { buildAnswerList, coerceIntake, intakeFields, missingRequired, titleFromAnswers, validateFieldKeys } from "@/lib/intake";
import type { FormSchema } from "@/lib/form-schema";

const schema: FormSchema = {
  title: "รับของ", description: "", icon: "📦", flow: "sequential",
  steps: [
    { id: "s1", title: "ข้อมูล", fields: [
      { id: "po", type: "text", label: "เลข PO", required: true },
      { id: "sup", type: "select", label: "ผู้ขาย", required: true, options: ["A01", "B02"], option_labels: ["บริษัท เอ", "บริษัท บี"] },
      { id: "qty", type: "number", label: "จำนวน", required: true, unit: "ชิ้น", max: 1000 },
      { id: "tags", type: "checkbox", label: "ป้าย", required: false, options: ["x", "y", "z"] },
      { id: "at", type: "datetime", label: "เวลา", required: false },
    ] },
    { id: "s2", title: "ตรวจ", fields: [
      { id: "ok", type: "pass_fail", label: "สภาพ", required: true, on_fail_require_note: true },
      { id: "items", type: "table", label: "รายการ", required: false, columns: [
        { id: "c1", label: "สินค้า", type: "text" },
        { id: "c2", label: "หน่วย", type: "select", options: ["EA", "BOX"], option_labels: ["ชิ้น", "กล่อง"] },
      ] },
      { id: "ph", type: "photo", label: "รูป", required: true },
    ] },
  ],
};
const keys = { po: "po_no", sup: "supplier" };

describe("intake: key ต่อช่อง", () => {
  it("ใช้ key ที่ตั้ง ถ้าไม่ตั้งใช้รหัสช่อง", () => {
    const f = intakeFields(schema, keys);
    expect(f.find((x) => x.field_id === "po")?.key).toBe("po_no");
    expect(f.find((x) => x.field_id === "qty")?.key).toBe("qty");
    expect(f.find((x) => x.field_id === "ph")?.accepts).toBe(false);
  });
  it("ตรวจรูปแบบและชื่อซ้ำ", () => {
    expect(validateFieldKeys(schema, { po: "qty" })).toHaveProperty("error");
    expect(validateFieldKeys(schema, { po: "9bad" })).toHaveProperty("error");
    expect(validateFieldKeys(schema, { po: "po_no", nope: "x", qty: " " })).toEqual({ keys: { po: "po_no" } });
  });
});

describe("intake: แปลงค่า", () => {
  it("แปลงทุกชนิด รับทั้งรหัสและชื่อที่แสดง", () => {
    const r = coerceIntake(schema, keys, {
      po_no: "PO-1", supplier: "บริษัท บี", qty: 12, tags: "x, z", at: "2026-10-01 08:30:00",
      ok: { value: "ไม่ผ่าน", note: "บุบ" }, items: [{ c1: "น็อต", หน่วย: "กล่อง" }, {}], extra: 1,
    });
    expect(r.errors).toEqual([]);
    expect(r.ignored).toEqual(["extra"]);
    expect(r.answers.sup.value).toBe("B02");
    expect(r.answers.qty.value).toBe("12");
    expect(r.answers.tags.value).toEqual(["x", "z"]);
    expect(r.answers.at.value).toBe("2026-10-01T08:30");
    expect(r.answers.ok).toEqual({ value: "fail", note: "บุบ", src: "api" });
    expect(r.answers.items.value).toEqual([{ c1: "น็อต", c2: "BOX" }]);
  });
  it("ค่าผิดรายงานเป็นรายช่อง", () => {
    const r = coerceIntake(schema, keys, { qty: "abc", supplier: "ไม่มี", ph: "data:image", ok: "maybe" });
    expect(r.errors.map((e) => e.key).sort()).toEqual(["ok", "ph", "qty", "supplier"]);
  });
  it("data ต้องเป็น object", () => {
    expect(coerceIntake(schema, keys, [1]).errors[0].key).toBe("data");
  });
});

describe("intake: ครบหรือไม่ครบ", () => {
  it("รูปที่บังคับทำให้ขาดเสมอ + ไม่ผ่านต้องมีหมายเหตุ", () => {
    const r = coerceIntake(schema, keys, { po_no: "P", supplier: "A01", qty: 1, ok: "fail" });
    expect(missingRequired(schema, r.answers).map((f) => f.id)).toEqual(["ok", "ph"]);
  });
  it("สร้างรายการคำตอบแบบเดียวกับหน้ากรอก", () => {
    const r = coerceIntake(schema, keys, { po_no: "P", supplier: "A01", qty: 2000, ok: "pass", items: [{ c1: "a", c2: "EA" }] });
    const { list, fails } = buildAnswerList(schema, r.answers);
    expect(fails).toEqual(["จำนวน (ค่านอกช่วง)"]);
    const sup = list.find((x) => x.label === "ผู้ขาย")!;
    expect(sup).toMatchObject({ display: "บริษัท เอ", code: "A01", src: "api" });
    const items = list.find((x) => x.label === "รายการ")!;
    expect(items.rows).toEqual([{ c1: "a", c2: "ชิ้น", "c2#code": "EA" }]);
    expect(titleFromAnswers(schema, r.answers)).toBe("เลข PO: P");
  });
});
