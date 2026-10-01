import { describe, it, expect } from "vitest";
import { ICONS, ICON_GROUPS, resolveIconKey, normalizeIcon, DEFAULT_ICON } from "@/lib/form-icons";
import { ICON_COMPONENTS } from "@/components/FormIcon";
import { FORM_TEMPLATES } from "@/lib/form-templates";
import { sanitizeSchema } from "@/lib/form-schema";

describe("form icons", () => {
  it("ทุกไอคอนในรายการมีตัววาด และ key ไม่ซ้ำ", () => {
    const keys = ICONS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(ICON_COMPONENTS[k], k).toBeTruthy();
  });

  it("ทุกไอคอนในกลุ่มมีอยู่ในรายการ และทุกไอคอนอยู่ในอย่างน้อย 1 กลุ่ม", () => {
    const keys = new Set(ICONS.map((i) => i.key));
    const grouped = new Set(ICON_GROUPS.flatMap((g) => g.icons));
    for (const k of grouped) expect(keys.has(k), k).toBe(true);
    for (const k of keys) expect(grouped.has(k), `ไม่อยู่ในกลุ่มไหน: ${k}`).toBe(true);
    expect(ICON_GROUPS.some((g) => g.kind === "task")).toBe(true);
    expect(ICON_GROUPS.some((g) => g.kind === "industry")).toBe(true);
  });

  it("แปลงอีโมจิเก่า/รหัส/ค่าว่าง ได้ไอคอนที่วาดได้เสมอ", () => {
    expect(resolveIconKey("📦")).toBe("package");
    expect(resolveIconKey("🔧")).toBe("wrench");
    expect(resolveIconKey("⚠")).toBe("triangle-alert"); // ไม่มี variation selector
    expect(resolveIconKey("i:truck")).toBe("truck");
    expect(resolveIconKey("truck")).toBe("truck");
    expect(resolveIconKey("")).toBe(DEFAULT_ICON.slice(2));
    expect(resolveIconKey("🦄")).toBe(DEFAULT_ICON.slice(2));
    expect(resolveIconKey("i:not-a-real-icon")).toBe(DEFAULT_ICON.slice(2));
  });

  it("บันทึกเป็นรหัส i:<ชื่อ> เสมอ", () => {
    expect(normalizeIcon("📦")).toBe("i:package");
    expect(normalizeIcon("forklift")).toBe("i:forklift");
    expect(normalizeIcon(undefined)).toBe(DEFAULT_ICON);
    expect(sanitizeSchema({ title: "x", icon: "🚚", steps: [{ title: "s", fields: [{ id: "a", type: "text", label: "a", required: true }] }] }).icon).toBe("i:truck");
  });

  it("เทมเพลตทุกตัวใช้รหัสไอคอนที่มีอยู่จริง", () => {
    const keys = new Set(ICONS.map((i) => i.key));
    for (const t of FORM_TEMPLATES) {
      expect(t.schema.icon.startsWith("i:"), t.id).toBe(true);
      expect(keys.has(t.schema.icon.slice(2)), `${t.id}: ${t.schema.icon}`).toBe(true);
    }
  });
});
