import { describe, it, expect } from "vitest";
import { reflowTops, buildBlocks, autoLayout, FIELD_H, fieldBoxHeight } from "@/lib/paper-layout";
import type { FormSchema } from "@/lib/form-schema";

const schema: FormSchema = {
  title: "t", description: "", icon: "📋", flow: "sequential",
  steps: [{ id: "s1", title: "A", fields: [
    { id: "a", type: "text", label: "a", required: true },
    { id: "b", type: "text", label: "b", required: true },
    { id: "c", type: "text", label: "c", required: true },
    { id: "d", type: "text", label: "d", required: true },
    { id: "e", type: "text", label: "e", required: true, width: "full" },
  ] }],
};
const blocks = buildBlocks(schema);
const layout = autoLayout(blocks);

describe("reflowTops", () => {
  it("ไม่มีช่องไหนเกินกล่อง → ตำแหน่งตามที่ออกแบบทุกช่อง", () => {
    const tops = reflowTops(blocks, layout, {});
    for (const b of blocks) expect(tops[b.key]).toBe(layout[b.key].y);
  });
  it("ช่องซ้ายงอก → ดันเฉพาะช่องด้านล่างที่ซ้อนแนวนอน · ช่องขวาไม่ขยับ", () => {
    const tops = reflowTops(blocks, layout, { a: FIELD_H + 40 });
    expect(tops.b).toBe(layout.b.y);        // ขวาแถวเดียวกัน
    expect(tops.c).toBe(layout.c.y + 40);   // ซ้ายแถวถัดไป
    expect(tops.d).toBe(layout.d.y);        // ขวาแถวถัดไป ไม่ซ้อนกับ a
    expect(tops.e).toBe(layout.e.y + 40);   // เต็มแถว ซ้อนกับ c ที่ถูกดัน
  });
  it("งอกสองแถวซ้อนกัน → ระยะดันสะสม", () => {
    const tops = reflowTops(blocks, layout, { a: FIELD_H + 20, c: FIELD_H + 30 });
    expect(tops.e).toBe(layout.e.y + 50);
  });
  it("ช่องที่สูงเท่าหรือเตี้ยกว่ากล่อง ไม่ดึงช่องด้านล่างขึ้น", () => {
    const tops = reflowTops(blocks, layout, { a: 20 });
    expect(tops.c).toBe(layout.c.y);
  });
  it("ตาราง: กล่องสูงตามจำนวนแถวเริ่มต้น", () => {
    expect(fieldBoxHeight({ id: "t", type: "table", label: "t", required: false, min_rows: 2 })).toBe(116);
  });
});
