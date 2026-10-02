import { describe, it, expect } from "vitest";
import { sanitizeSchema, type FormField, type FormSchema } from "@/lib/form-schema";
import { pfCodeOf, pfDisplay } from "@/lib/field-display";
import { sanitizePublicAnswers } from "@/lib/public-answers";

const one = (f: Partial<FormField>): FormSchema => ({ title: "t", description: "", icon: "", flow: "sequential", steps: [{ id: "s", title: "S", fields: [{ id: "x", label: "X", required: false, type: "text", ...f } as FormField] }] } as FormSchema);
const field = (f: Partial<FormField>) => sanitizeSchema(one(f)).steps[0].fields[0];

describe("new field options survive sanitize", () => {
  it("text kind + format", () => {
    expect(field({ type: "text", long_text: true, text_format: "email" })).toMatchObject({ long_text: true, text_format: "email" });
    expect(field({ type: "text", text_format: "fax" as never }).text_format).toBeUndefined();
  });
  it("datetime mode", () => {
    expect(field({ type: "datetime", dt_mode: "date", dt_no_default: true })).toMatchObject({ dt_mode: "date", dt_no_default: true });
    expect(field({ type: "datetime", dt_mode: "datetime" }).dt_mode).toBeUndefined();
  });
  it("pass/fail labels + N/A", () => {
    expect(field({ type: "pass_fail", pass_label: "OK", fail_label: "NG", allow_na: true })).toMatchObject({ pass_label: "OK", fail_label: "NG", allow_na: true });
  });
  it("signature name, select up to 200 options, table max rows + required column", () => {
    expect(field({ type: "signature", sign_name: true }).sign_name).toBe(true);
    expect(field({ type: "select", options: Array.from({ length: 50 }, (_, i) => `o${i}`) }).options).toHaveLength(50);
    const t = field({ type: "table", min_rows: 2, max_rows: 1, columns: [{ id: "a", label: "A", type: "text", required: true }, { id: "f", label: "F", type: "formula", formula: "1", required: true } as never] });
    expect(t.max_rows).toBe(2); // ไม่น้อยกว่าแถวเริ่มต้น
    expect(t.columns?.[0].required).toBe(true);
    expect(t.columns?.[1].required).toBeUndefined(); // คอลัมน์สูตรบังคับไม่ได้
  });
});

describe("pass/fail display", () => {
  const f = { pass_label: "OK", fail_label: "NG", allow_na: true };
  it("maps codes to labels and back", () => {
    expect(pfDisplay(f, "pass")).toBe("OK");
    expect(pfDisplay({}, "fail")).toBe("ไม่ผ่าน");
    expect(pfDisplay(f, "na")).toBe("ไม่เกี่ยวข้อง");
    expect(pfCodeOf(f, "NG")).toBe("fail");
    expect(pfCodeOf(f, "ไม่ผ่าน")).toBe("fail");
    expect(pfCodeOf(f, "ไม่เกี่ยวข้อง")).toBe("na");
    expect(pfCodeOf({}, "ไม่เกี่ยวข้อง")).toBe("");
  });
  it("public submit honours custom fail label", () => {
    const r = sanitizePublicAnswers(one({ type: "pass_fail", label: "X", fail_label: "NG" }), [{ label: "X", type: "pass_fail", display: "NG", note: "แตก" }], new Set());
    expect(r.result).toBe("fail");
    expect(r.answers[0]).toMatchObject({ display: "NG", fail: true });
  });
});
