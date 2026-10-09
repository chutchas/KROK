import { describe, it, expect } from "vitest";
import { guessDefectOptions, defectSuggestions, applyDefectSuggestions } from "@/lib/defect-words";
import type { FormSchema } from "@/lib/form-schema";

describe("guessDefectOptions", () => {
  it("เสนอคำชัดเจน และ 'ขาด' เมื่ออยู่คู่กับคำชัดเจน", () => {
    expect(guessDefectOptions(["ปกติ", "ชำรุด", "ขาด"])).toEqual(["ชำรุด", "ขาด"]);
    expect(guessDefectOptions(["OK", "NG"])).toEqual(["NG"]);
    expect(guessDefectOptions(["ผ่าน", "ไม่ผ่าน"])).toEqual(["ไม่ผ่าน"]);
  });
  it("ไม่เสนอเมื่อมีแต่คำกำกวม หรือคำทั่วไป", () => {
    expect(guessDefectOptions(["มา", "สาย", "ขาด"])).toEqual([]); // ลงเวลา
    expect(guessDefectOptions(["ชิ้น", "กล่อง", "แพ็ค"])).toEqual([]);
    expect(guessDefectOptions(["เสียง", "เสียบปลั๊ก"])).toEqual([]);
  });
});

describe("defectSuggestions", () => {
  const schema = { title: "x", description: "", icon: "", flow: "sequential", steps: [{ id: "s1", title: "s", fields: [
    { id: "items", type: "table", label: "รายการสินค้า", required: true, columns: [
      { id: "unit", label: "หน่วย", type: "select", options: ["ชิ้น", "กล่อง"] },
      { id: "cond", label: "สภาพ", type: "select", options: ["ปกติ", "ชำรุด", "ขาด"] },
    ] },
    { id: "g", type: "select", label: "ผล", required: true, options: ["ผ่าน", "ไม่ผ่าน"], fail_options: ["ไม่ผ่าน"] },
  ] }] } as unknown as FormSchema;
  it("เสนอเฉพาะช่องที่ยังไม่ได้ตั้ง และใส่ค่าได้", () => {
    const s = defectSuggestions(schema);
    expect(s).toEqual([{ fieldId: "items", colId: "cond", label: "รายการสินค้า › สภาพ", options: ["ชำรุด", "ขาด"] }]);
    const next = applyDefectSuggestions(schema, s);
    expect(next.steps[0].fields[0].columns?.[1].fail_options).toEqual(["ชำรุด", "ขาด"]);
    expect(next.steps[0].fields[0].columns?.[0].fail_options).toBeUndefined();
    expect(defectSuggestions(next)).toEqual([]);
  });
});
