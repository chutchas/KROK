import { describe, it, expect } from "vitest";
import { sanitizePublicAnswers } from "@/lib/public-answers";
import type { FormSchema } from "@/lib/form-schema";

const schema: FormSchema = {
  title: "x", description: "", icon: "📋", flow: "sequential",
  steps: [{ id: "s1", title: "a", fields: [
    { id: "t", type: "text", label: "ชื่อ", required: true },
    { id: "n", type: "number", label: "อุณหภูมิ", required: true, max: 8 },
    { id: "p", type: "pass_fail", label: "สภาพ", required: true },
    { id: "ph", type: "photo", label: "รูป", required: false },
    { id: "tb", type: "table", label: "ตาราง", required: false, columns: [{ id: "c1", label: "ของ", type: "text" }] },
  ] }],
};

describe("sanitizePublicAnswers", () => {
  it("คำนวณไม่ผ่านใหม่ ไม่เชื่อ result จาก client และตัด property แปลก ๆ", () => {
    const r = sanitizePublicAnswers(schema, [
      { label: "ชื่อ", type: "text", display: "สมชาย", evil: "<script>", src: "hack" },
      { label: "อุณหภูมิ", type: "number", display: "12 °C" },
      { label: "สภาพ", type: "pass_fail", display: "ผ่าน" },
      { label: "รูป", type: "photo", display: "ok", photoField: "../../x" },
      { label: "ตาราง", type: "table", rows: [{ c1: "น็อต", zz: "x" }, {}], columns: [{ id: "bad" }] },
    ], new Set());
    expect(r.result).toBe("fail");
    expect(r.fails).toEqual(["อุณหภูมิ (ค่านอกช่วง)"]);
    expect(r.answers[0]).toEqual({ id: "t", label: "ชื่อ", type: "text", display: "สมชาย" });
    expect(r.answers[3]).toEqual({ id: "ph", label: "รูป", type: "photo", display: "—" });
    expect(r.answers[4].rows).toEqual([{ c1: "น็อต" }]);
    expect(r.answers[4].columns).toEqual([{ id: "c1", label: "ของ", type: "text" }]);
  });
  it("ช่องที่ไม่ส่งมาได้ — และรูปที่อัปโหลดจริงผูก photoField ด้วย id ของช่อง", () => {
    const r = sanitizePublicAnswers(schema, [{ label: "สภาพ", type: "pass_fail", display: "ไม่ผ่าน", note: "บุบ" }], new Set(["ph"]));
    expect(r.answers.length).toBe(5);
    expect(r.answers[2]).toMatchObject({ fail: true, note: "บุบ" });
    expect(r.answers[3]).toMatchObject({ photoField: "ph" });
    expect(r.result).toBe("fail");
  });
  it("payload ไม่ใช่ array", () => {
    expect(sanitizePublicAnswers(schema, { a: 1 }, new Set()).answers.length).toBe(5);
  });
});

describe("sanitizePublicAnswers — match by field id", () => {
  it("keeps the answer when the field was renamed after filling (offline queue)", async () => {
    const { sanitizePublicAnswers } = await import("@/lib/public-answers");
    const schema = { title: "t", icon: "x", flow: "sequential", steps: [{ id: "s", title: "s", fields: [
      { id: "temp", type: "number", label: "อุณหภูมิใหม่", required: false, max: 50 },
    ] }] } as never;
    const r = sanitizePublicAnswers(schema, [{ id: "temp", label: "อุณหภูมิ", type: "number", display: "80" }], new Set());
    expect(r.answers[0].display).toBe("80");
    expect(r.result).toBe("fail");
  });
});
