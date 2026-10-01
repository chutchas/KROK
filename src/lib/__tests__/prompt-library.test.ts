import { describe, it, expect } from "vitest";
import { PROMPT_IDS, PROMPTS_BY_TASK, PROMPTS_BY_INDUSTRY, buildPrompt, parseField } from "@/lib/prompt-library";

describe("prompt library", () => {
  it("ทุกปุ่มชี้ไปยังตัวอย่างที่มีอยู่จริง", () => {
    for (const g of [...PROMPTS_BY_TASK, ...PROMPTS_BY_INDUSTRY])
      for (const it of g.items) expect(PROMPT_IDS, it.id).toContain(it.id);
  });

  it("คำสั่งเต็มอ่านได้ทุกตัว มีฟิลด์ และไม่เกินขีดจำกัด 2000 ตัวอักษรของ AI", () => {
    for (const id of PROMPT_IDS)
      for (const lang of ["th", "en"] as const) {
        const p = buildPrompt(id, lang);
        expect(p.length, `${id}/${lang} ยาว ${p.length}`).toBeLessThan(1900);
        expect(p.split("\n").filter((l) => l.startsWith("- ")).length, id).toBeGreaterThanOrEqual(5);
      }
  });

  it("ตัวเลือกไทย/อังกฤษจำนวนเท่ากัน", () => {
    // อ่านผ่าน buildPrompt ทุกฟิลด์ (parseField throw ถ้าชนิดผิด) และนับตัวเลือก select/checkbox/table
    for (const id of PROMPT_IDS) {
      const th = buildPrompt(id, "th").split("\n");
      const en = buildPrompt(id, "en").split("\n");
      expect(th.length, id).toBe(en.length);
      th.forEach((l, i) => {
        if (/(เลือก|ตาราง)/.test(l)) expect(l.split(", ").length, `${id}: ${l} | ${en[i]}`).toBe(en[i].split(", ").length);
      });
    }
  });

  it("ชื่อปุ่มสั้น", () => {
    for (const g of [...PROMPTS_BY_TASK, ...PROMPTS_BY_INDUSTRY])
      for (const it of g.items) { expect(it.th.length, it.th).toBeLessThanOrEqual(36); expect(it.en.length, it.en).toBeLessThanOrEqual(34); }
  });

  it("parseField ปฏิเสธชนิดที่ไม่รู้จัก", () => {
    expect(() => parseField("ก|A|bogus", "th")).toThrow();
  });
});

describe("prompt library vs templates", () => {
  it("ไม่มีตัวอย่างที่ชื่อซ้ำกับเทมเพลต", async () => {
    const { FORM_TEMPLATES } = await import("@/lib/form-templates");
    const titles = FORM_TEMPLATES.map((t) => t.schema.title);
    for (const g of [...PROMPTS_BY_TASK, ...PROMPTS_BY_INDUSTRY])
      for (const it of g.items) expect(titles, it.th).not.toContain(it.th);
  });

  it("ทุกตัวอย่างในคลังถูกใช้ในอย่างน้อย 1 กลุ่ม", () => {
    const used = new Set([...PROMPTS_BY_TASK, ...PROMPTS_BY_INDUSTRY].flatMap((g) => g.items.map((i) => i.id)));
    expect(PROMPT_IDS.filter((id) => !used.has(id))).toEqual([]);
  });
});
