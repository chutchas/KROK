import { describe, it, expect } from "vitest";
import { sanitizeSchema, countFields, type FormSchema } from "@/lib/form-schema";

const base = {
  title: "ตรวจเครื่องจักร",
  description: "ประจำวัน",
  icon: "🔧",
  steps: [
    {
      title: "ก่อนเริ่ม",
      fields: [
        { id: "temp", type: "number", label: "อุณหภูมิ", required: true, min: 0, max: 100, unit: "°C" },
        { id: "ok", type: "pass_fail", label: "สภาพทั่วไป", required: true },
        { id: "bad", type: "not_a_type", label: "ควรถูกตัดทิ้ง" },
      ],
    },
  ],
};

describe("sanitizeSchema", () => {
  it("keeps valid fields and drops unknown field types", () => {
    const s = sanitizeSchema(base);
    expect(s.steps).toHaveLength(1);
    expect(s.steps[0].fields.map((f) => f.id)).toEqual(["temp", "ok"]);
    expect(countFields(s)).toBe(2);
  });

  it("preserves number constraints and unit", () => {
    const s = sanitizeSchema(base);
    const temp = s.steps[0].fields[0];
    expect(temp.min).toBe(0);
    expect(temp.max).toBe(100);
    expect(temp.unit).toBe("°C");
  });

  it("throws when there are no usable fields", () => {
    expect(() => sanitizeSchema({ title: "x", steps: [{ title: "s", fields: [] }] })).toThrow();
    expect(() => sanitizeSchema(null)).toThrow();
  });

  it("keeps only layout entries that match real field / step ids and clamps bounds", () => {
    const withLayout = {
      ...base,
      layout: {
        temp: { x: -50, y: 20, w: 5000 },   // x clamps to 0, w clamps to 794
        "s:s1": { x: 40, y: 0, w: 700 },     // step header key
        ghost: { x: 10, y: 10, w: 100 },     // no such field → dropped
      },
    };
    const s = sanitizeSchema(withLayout) as Required<FormSchema>;
    expect(s.layout).toBeDefined();
    expect(Object.keys(s.layout).sort()).toEqual(["s:s1", "temp"]);
    expect(s.layout.temp.x).toBe(0);
    expect(s.layout.temp.w).toBe(794);
  });

  it("truncates over-long titles and defaults the icon", () => {
    const s = sanitizeSchema({ title: "x".repeat(500), steps: base.steps });
    expect(s.title.length).toBeLessThanOrEqual(150);
    expect(s.icon).toBeTruthy();
  });
});
