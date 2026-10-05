import { describe, expect, it } from "vitest";
import { diffCounts, diffForms } from "./form-diff";
import type { FormSchema } from "./form-schema";

const base = (): FormSchema => ({
  title: "ตรวจ", description: "", icon: "📋", flow: "sequential",
  steps: [
    { id: "s1", title: "ขั้น 1", fields: [
      { id: "a", type: "text", label: "ชื่อ", required: true },
      { id: "b", type: "number", label: "อุณหภูมิ", required: false, min: 0, max: 10 },
    ] },
    { id: "s2", title: "ขั้น 2", fields: [{ id: "c", type: "select", label: "ผล", required: false, options: ["ผ่าน", "ไม่ผ่าน"] }] },
  ],
});

describe("diffForms", () => {
  it("เหมือนกัน", () => {
    expect(diffForms(base(), base()).same).toBe(true);
  });
  it("เพิ่ม/ลบ/แก้ชื่อ/ย้ายขั้น/ตัวเลือก/ช่วงค่า", () => {
    const n = base();
    n.title = "ตรวจใหม่";
    n.steps[0].fields[0].label = "ชื่อผู้ตรวจ";
    n.steps[0].fields[1].max = 20;
    n.steps[1].fields[0].options = ["ผ่าน", "ไม่ผ่าน", "N/A"];
    n.steps[1].fields.push(n.steps[0].fields.shift()!); // ย้าย a ไปขั้น 2
    n.steps[0].fields.push({ id: "d", type: "photo", label: "รูป", required: false });
    n.steps.push({ id: "s3", title: "ขั้น 3", fields: [] });
    const d = diffForms(base(), n);
    expect(d.title).toEqual({ from: "ตรวจ", to: "ตรวจใหม่" });
    expect(d.steps.added).toEqual(["ขั้น 3"]);
    const kinds = d.fields.map((c) => `${c.kind}:${c.id}`).sort();
    expect(kinds).toEqual(["added:d", "label:a", "limits:b", "moved:a", "options:c"].sort());
    expect(diffCounts(d)).toEqual({ added: 1, removed: 0, changed: 3 });
  });
  it("ลบช่อง + เปลี่ยนแค่หน้ากระดาษ", () => {
    const n = base();
    n.steps[1].fields = [];
    n.layout = { a: { x: 1, y: 2, w: 3 } };
    const d = diffForms(base(), n);
    expect(d.fields).toEqual([{ kind: "removed", id: "c", label: "ผล" }]);
    expect(d.other).toEqual(["layout"]);
  });
  it("เพิ่มขั้นเปล่า ไม่นับว่าแก้ผู้รับผิดชอบ/แหล่งเติมข้อมูล", () => {
    const n = base();
    n.steps.push({ id: "s3", title: "ขั้น 3", fields: [] });
    expect(diffForms(base(), n).other).toEqual([]);
    n.steps[0].assignee = { team_id: "t" };
    expect(diffForms(base(), n).other).toEqual(["assignee"]);
  });
  it("ไม่มีเวอร์ชันก่อนหน้า = ทุกช่องเป็นของใหม่", () => {
    expect(diffCounts(diffForms(null, base())).added).toBe(3);
  });
});
