import { describe, it, expect } from "vitest";
import { FORM_TEMPLATES, getTemplate } from "@/lib/form-templates";
import { sanitizeSchema, countFields } from "@/lib/form-schema";

describe("form templates", () => {
  it("has unique template ids", () => {
    const ids = FORM_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(FORM_TEMPLATES.map((t) => [t.id, t] as const))(
    "template %s sanitizes without dropping any field",
    (_id, tpl) => {
      const rawCount = tpl.schema.steps.reduce((n, s) => n + s.fields.length, 0);
      const clean = sanitizeSchema(tpl.schema);
      // ไม่มีฟิลด์ไหนถูกตัด = ทุก type ถูกต้อง
      expect(countFields(clean)).toBe(rawCount);
      // มี title / icon / อย่างน้อยหนึ่ง step
      expect(clean.title.length).toBeGreaterThan(0);
      expect(clean.icon.length).toBeGreaterThan(0);
      expect(clean.steps.length).toBe(tpl.schema.steps.length);
    }
  );

  it("getTemplate finds by id and returns undefined otherwise", () => {
    expect(getTemplate(FORM_TEMPLATES[0].id)?.id).toBe(FORM_TEMPLATES[0].id);
    expect(getTemplate("does-not-exist")).toBeUndefined();
  });
});
