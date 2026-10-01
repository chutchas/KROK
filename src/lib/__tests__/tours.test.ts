import { describe, expect, it } from "vitest";
import { TOURS, tourFor } from "../tours";

describe("tours", () => {
  it("เลือกทัวร์ตามหน้า", () => {
    expect(tourFor("/dashboard", () => true)?.id).toBe("dashboard");
    expect(tourFor("/fill/abc", () => true)?.id).toBe("fill");
    expect(tourFor("/settings/team", () => true)).toBeNull();
  });
  it("studio: กำลังแก้ฟอร์ม (มี canvas) → ทัวร์ editor ก่อน · ดูแล้ว → ทัวร์หน้าแรก", () => {
    expect(tourFor("/studio", () => true)?.id).toBe("studio-editor");
    expect(tourFor("/studio", (t) => t !== "studio-canvas")?.id).toBe("studio");
    expect(tourFor("/studio", () => true, (id) => id === "studio-editor")?.id).toBe("studio");
  });
  it("ไม่มี element ให้ชี้เลย → ไม่เริ่ม · ดูแล้ว → ไม่เริ่ม", () => {
    expect(tourFor("/reports", () => false)).toBeNull();
    expect(tourFor("/dashboard", () => true, () => true)).toBeNull();
  });
  it("id ไม่ซ้ำ และทุกขั้นมี id", () => {
    const ids = TOURS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TOURS) for (const s of t.steps) expect(s.id).toBeTruthy();
  });
});

import { th } from "@/i18n/th";
describe("tour texts", () => {
  it("ทุกขั้นมีหัวข้อและรายละเอียดในพจนานุกรม", () => {
    const keys = new Set(Object.keys(th));
    for (const t of TOURS) for (const s of t.steps) {
      expect(keys.has(`tour.${t.id}.${s.id}.t`), `tour.${t.id}.${s.id}.t`).toBe(true);
      expect(keys.has(`tour.${t.id}.${s.id}.b`), `tour.${t.id}.${s.id}.b`).toBe(true);
    }
  });
});
