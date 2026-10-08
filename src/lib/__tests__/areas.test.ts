import { describe, it, expect } from "vitest";
import { areaFieldOf, sanitizeSchema, type FormField, type FormSchema } from "@/lib/form-schema";
import { sanitizePublicAnswers } from "@/lib/public-answers";
import { buildAnswerList } from "@/lib/intake";
import { groupByArea, openAge, type OpenItem } from "@/lib/areas";

const schemaOf = (fields: Partial<FormField>[], fields2: Partial<FormField>[] = []): FormSchema => ({
  title: "t", description: "", icon: "", flow: "sequential",
  steps: [
    { id: "s1", title: "ยื่นขอ", fields: fields.map((f, i) => ({ id: `a${i}`, label: `A${i}`, required: false, type: "text", ...f }) as FormField) },
    ...(fields2.length ? [{ id: "s2", title: "อนุมัติ", fields: fields2.map((f, i) => ({ id: `b${i}`, label: `B${i}`, required: false, type: "text", ...f }) as FormField) }] : []),
  ],
} as FormSchema);

describe("ฟิลด์พื้นที่ใน schema", () => {
  it("เก็บ area เฉพาะ select · ตัดตัวเลือกที่พิมพ์เอง/ถังข้อมูล", () => {
    const s = sanitizeSchema(schemaOf([{ type: "select", area: true, options: ["x"], options_source: { dataset_id: "00000000-0000-0000-0000-000000000000", column: "c" } }]));
    const f = s.steps[0].fields[0];
    expect(f.area).toBe(true);
    expect(f.options).toBeUndefined();
    expect(f.options_source).toBeUndefined();
    expect(areaFieldOf(s)?.id).toBe("a0");
  });

  it("ชนิดอื่นที่มี area ถูกตัดทิ้ง", () => {
    const s = sanitizeSchema(schemaOf([{ type: "text", area: true }, { type: "checkbox", area: true, options: ["a"] }]));
    expect(s.steps[0].fields.every((f) => !f.area)).toBe(true);
    expect(areaFieldOf(s)).toBeNull();
  });

  it("ฟอร์มละ 1 ช่อง — ช่องที่สอง (แม้อยู่คนละขั้น) ไม่เป็นพื้นที่", () => {
    const s = sanitizeSchema(schemaOf([{ type: "select", area: true }], [{ type: "select", area: true, area_default: "Z1" }]));
    expect(s.steps[0].fields[0].area).toBe(true);
    expect(s.steps[1].fields[0].area).toBeUndefined();
    expect(s.steps[1].fields[0].area_default).toBeUndefined();
  });

  it("ค่าเริ่มต้นต้องเป็นรหัสที่ถูกรูป", () => {
    expect(sanitizeSchema(schemaOf([{ type: "select", area: true, area_default: "Z-3" }])).steps[0].fields[0].area_default).toBe("Z-3");
    expect(sanitizeSchema(schemaOf([{ type: "select", area: true, area_default: "Z 3" }])).steps[0].fields[0].area_default).toBeUndefined();
    expect(sanitizeSchema(schemaOf([{ type: "select", area: true, area_default: "a,b" }])).steps[0].fields[0].area_default).toBeUndefined();
  });
});

describe("คำตอบของฟิลด์พื้นที่ถูกติดป้ายให้ฐานข้อมูลอ่าน", () => {
  const s = sanitizeSchema(schemaOf([{ type: "text" }, { type: "select", area: true }]));
  it("ส่งจากหน้ากรอก (server กรองแล้ว)", () => {
    const r = sanitizePublicAnswers(s, [
      { id: "a0", label: "A0", type: "text", display: "x", area: true },
      { id: "a1", label: "A1", type: "select", display: "โซน 3", code: "Z3" },
    ], new Set());
    expect(r.answers[0].area).toBeUndefined(); // client ส่ง area มาเองไม่ได้
    expect(r.answers[1]).toMatchObject({ display: "โซน 3", code: "Z3", area: true });
  });
  it("ส่งผ่าน API รับข้อมูลเข้า", () => {
    const resolved = structuredClone(s);
    resolved.steps[0].fields[1].options = ["Z3"];
    resolved.steps[0].fields[1].option_labels = ["โซน 3"];
    const { list } = buildAnswerList(resolved, { a1: { value: "Z3" } });
    expect(list.find((x) => x.id === "a1" || x.label === "A1")).toMatchObject({ display: "โซน 3", code: "Z3", area: true });
  });
});

describe("ใบที่ยังไม่จบตามพื้นที่", () => {
  const it0 = (p: Partial<OpenItem>): OpenItem => ({
    kind: "case", id: "1", form_id: "f", form_title: "งานเชื่อม", form_icon: "🔥",
    area_id: "A", area_code: "Z3", area_name: "โซน 3", step_title: "", holder: "", started_at: "2026-10-08T00:00:00Z", ...p,
  });
  it("จัดกลุ่มตามพื้นที่ · ในกลุ่มเก่าสุดก่อน", () => {
    const g = groupByArea([
      it0({ id: "1", started_at: "2026-10-08T05:00:00Z" }),
      it0({ id: "2", area_id: "B", area_code: "K1", area_name: "คลัง 1" }),
      it0({ id: "3", started_at: "2026-10-08T01:00:00Z" }),
    ]);
    expect(g.map((x) => x.area_code)).toEqual(["K1", "Z3"]);
    expect(g[1].items.map((x) => x.id)).toEqual(["3", "1"]);
  });
  it("อายุงาน นาที / ชม. / วัน", () => {
    const now = Date.parse("2026-10-08T00:00:00Z");
    expect(openAge("2026-10-07T23:30:00Z", now)).toEqual({ unit: "m", n: 30 });
    expect(openAge("2026-10-07T10:00:00Z", now)).toEqual({ unit: "h", n: 14 });
    expect(openAge("2026-10-05T00:00:00Z", now)).toEqual({ unit: "d", n: 3 });
  });
});
