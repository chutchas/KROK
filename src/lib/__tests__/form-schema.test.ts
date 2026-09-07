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

  it("parses table columns, clamps min_rows, coerces column type and width", () => {
    const s = sanitizeSchema({
      title: "ใบสั่งซื้อ",
      steps: [
        {
          title: "รายการ",
          fields: [
            {
              id: "items",
              type: "table",
              label: "รายการสินค้า",
              min_rows: 99, // clamp → 20
              columns: [
                { id: "name", label: "ชื่อ", type: "text", width: 9 }, // width clamp → 6
                { id: "qty", label: "จำนวน", type: "number" },
                { id: "unit", label: "หน่วย", type: "select", options: ["ชิ้น", "กล่อง"] },
                { id: "bad", label: "ผิดชนิด", type: "not_a_type" }, // → text
              ],
            },
          ],
        },
      ],
    });
    const t = s.steps[0].fields[0];
    expect(t.type).toBe("table");
    expect(t.min_rows).toBe(20);
    expect(t.columns).toHaveLength(4);
    expect(t.columns![0].width).toBe(6);
    expect(t.columns![2].options).toEqual(["ชิ้น", "กล่อง"]);
    expect(t.columns![3].type).toBe("text");
  });

  it("defaults a table with no columns to a single 'รายการ' column and min_rows 1", () => {
    const s = sanitizeSchema({
      title: "t",
      steps: [{ title: "s", fields: [{ id: "tb", type: "table", label: "ตาราง" }] }],
    });
    const t = s.steps[0].fields[0];
    expect(t.columns).toHaveLength(1);
    expect(t.columns![0].id).toBe("c0");
    expect(t.min_rows).toBe(1);
  });

  it("keeps field width full/half and drops invalid width", () => {
    const s = sanitizeSchema({
      title: "t",
      steps: [
        {
          title: "s",
          fields: [
            { id: "a", type: "text", label: "A", width: "full" },
            { id: "b", type: "text", label: "B", width: "third" }, // invalid → undefined
          ],
        },
      ],
    });
    expect(s.steps[0].fields[0].width).toBe("full");
    expect(s.steps[0].fields[1].width).toBeUndefined();
  });

  it("keeps header/meta layout blocks and honors show_header/show_meta", () => {
    const s = sanitizeSchema({
      title: "t",
      show_header: false,
      show_meta: false,
      steps: [{ title: "s", fields: [{ id: "a", type: "text", label: "A" }] }],
      layout: {
        header: { x: 32, y: 26, w: 500 },
        meta: { x: 596, y: 26, w: 166 },
        a: { x: 40, y: 96, w: 300 },
      },
    }) as Required<FormSchema>;
    expect(s.show_header).toBe(false);
    expect(s.show_meta).toBe(false);
    expect(Object.keys(s.layout).sort()).toEqual(["a", "header", "meta"]);
  });
});
