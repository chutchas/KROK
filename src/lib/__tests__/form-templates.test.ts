import { describe, it, expect } from "vitest";
import { FORM_TEMPLATES, TEMPLATE_INDUSTRIES, getTemplate } from "@/lib/form-templates";
import { sanitizeSchema, countFields } from "@/lib/form-schema";
import { FORM_CATEGORIES, isPresetCategory } from "@/lib/form-categories";
import { PROMPTS_BY_TASK, PROMPTS_BY_INDUSTRY } from "@/lib/prompt-library";

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

const IND = new Set(TEMPLATE_INDUSTRIES.map((i) => i.key));

describe("form templates — ประเภท/อุตสาหกรรม/ไม่ซ้ำ", () => {
  it("id ไม่ซ้ำ และหาเจอด้วย getTemplate", () => {
    const ids = FORM_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(getTemplate(id)?.id).toBe(id);
  });

  it("ทุกเทมเพลตมีประเภท (ลักษณะงาน) และอุตสาหกรรมที่รู้จัก", () => {
    const cats = new Set(FORM_CATEGORIES.map((c) => c.key));
    for (const t of FORM_TEMPLATES) {
      expect(cats.has(t.schema.category || ""), `${t.id} category`).toBe(true);
      expect(t.industries.length, t.id).toBeGreaterThan(0);
      for (const i of t.industries) expect(IND.has(i), `${t.id}: ${i}`).toBe(true);
    }
  });

  it("schema ผ่าน sanitizeSchema โดยไม่ตกหล่นฟิลด์ และ field id ไม่ซ้ำในฟอร์ม", () => {
    for (const t of FORM_TEMPLATES) {
      const ids = t.schema.steps.flatMap((s) => s.fields.map((f) => f.id));
      expect(new Set(ids).size, `${t.id} field ids ซ้ำ`).toBe(ids.length);
      const clean = sanitizeSchema(t.schema);
      expect(clean.steps.flatMap((s) => s.fields).length, t.id).toBe(ids.length);
      expect(isPresetCategory(clean.category), t.id).toBe(true);
      for (const f of clean.steps.flatMap((s) => s.fields)) {
        if (f.type === "select" || f.type === "checkbox") expect(f.options?.length, `${t.id}.${f.id}`).toBeGreaterThan(1);
        if (f.type === "table") expect(f.columns?.length, `${t.id}.${f.id}`).toBeGreaterThan(1);
      }
    }
  });

  it("ไม่ซ้ำกับตัวอย่างคำสั่ง AI", () => {
    const prompts = [...PROMPTS_BY_TASK, ...PROMPTS_BY_INDUSTRY].flatMap((g) => g.items.map((i) => i.th));
    for (const t of FORM_TEMPLATES) expect(prompts, t.schema.title).not.toContain(t.schema.title);
  });

  it("ทุกกลุ่มอุตสาหกรรมมีเทมเพลตอย่างน้อย 1 ตัว", () => {
    for (const i of TEMPLATE_INDUSTRIES) expect(FORM_TEMPLATES.some((t) => t.industries.includes(i.key)), i.key).toBe(true);
  });
});
