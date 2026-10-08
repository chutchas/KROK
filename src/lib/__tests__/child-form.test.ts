import { describe, it, expect } from "vitest";
import { sanitizeChildForm, sanitizeSchema, isUiOnlyField } from "@/lib/form-schema";
import { sanitizePublicAnswers } from "@/lib/public-answers";
import { mergeChildRows } from "@/lib/child-rows";
import { buildAnswerList, intakeFields } from "@/lib/intake";

const FID = "11111111-2222-3333-4444-555555555555";

function schema(cfg: Record<string, unknown> = {}) {
  return sanitizeSchema({
    title: "ใบหลัก",
    steps: [
      { id: "s1", title: "ขอ", fields: [{ id: "loc", type: "text", label: "จุดงาน" }] },
      {
        id: "s2", title: "ตรวจ", fields: [
          { id: "btn", type: "child_form", label: "วัดแก๊ส", required: true,
            child_form: { form_id: FID, send: [{ to: "c_loc", from: "loc" }], table_id: "gas", map: [{ col: "o2", from: "c_o2" }, { col: "pic", from: "c_pic" }, { col: "ok", from: "c_ok" }], ...cfg } },
          { id: "gas", type: "table", label: "ผลวัด", columns: [{ id: "o2", label: "O2", type: "number" }, { id: "pic", label: "รูป", type: "photo" }, { id: "ok", label: "ผลตรวจ", type: "pass_fail" }] },
        ],
      },
    ],
  });
}

describe("sanitizeChildForm", () => {
  it("rejects a bad form id", () => {
    expect(sanitizeChildForm({ form_id: "x" })).toBeUndefined();
    expect(sanitizeChildForm(null)).toBeUndefined();
  });
  it("defaults: multiple + gate on, source_only off", () => {
    const c = sanitizeChildForm({ form_id: FID })!;
    expect(c).toMatchObject({ multiple: true, gate: true, source_only: false, send: [], map: [], table_id: "" });
  });
  it("send = field or constant, drops duplicates/empty", () => {
    const c = sanitizeChildForm({ form_id: FID, send: [{ to: "a", from: "x" }, { to: "a", from: "y" }, { to: "b", value: " งาน " }, { to: "c", value: "  " }, { to: "bad id!", from: "x" }] })!;
    expect(c.send).toEqual([{ to: "a", from: "x" }, { to: "b", value: " งาน " }]);
  });
});

describe("child_form in schema", () => {
  it("is never required and keeps mappings to a same-step table", () => {
    const f = schema().steps[1].fields[0];
    expect(f.required).toBe(false);
    expect(f.child_form?.table_id).toBe("gas");
  });
  it("drops map columns that cannot receive values (photo)", () => {
    expect(schema().steps[1].fields[0].child_form?.map).toEqual([{ col: "o2", from: "c_o2" }, { col: "ok", from: "c_ok" }]);
  });
  it("clears table_id pointing to another step", () => {
    const s = sanitizeSchema({
      title: "x",
      steps: [
        { id: "a", title: "a", fields: [{ id: "t", type: "table", label: "t", columns: [{ id: "c", label: "c", type: "text" }] }] },
        { id: "b", title: "b", fields: [{ id: "btn", type: "child_form", label: "b", child_form: { form_id: FID, table_id: "t", map: [{ col: "c", from: "z" }] } }] },
      ],
    });
    expect(s.steps[1].fields[0].child_form?.table_id).toBe("");
  });
  it("is UI-only: no answer, not in intake", () => {
    const s = schema();
    expect(isUiOnlyField(s.steps[1].fields[0])).toBe(true);
    const { answers } = sanitizePublicAnswers(s, [{ id: "btn", type: "child_form", display: "x" }], new Set());
    expect(answers.some((a) => a.id === "btn")).toBe(false);
    expect(intakeFields(s, {}).some((f) => f.field_id === "btn")).toBe(false);
    expect(buildAnswerList(s, {}).list.some((a) => a.id === "btn")).toBe(false);
  });
});

describe("child rows on final submit", () => {
  const dbRow = { _child: "L1", _src: "ตรวจเซฟตี้", _sub: "S1", _at: "2026-10-08 10:00", o2: "20.9", ok: "pass" };
  const failRow = { _child: "L2", _src: "ตรวจเซฟตี้", _sub: "S2", _at: "2026-10-08 11:00", ok: "fail" };
  const caseAnswers = { gas: { value: [{ o2: "1" }, dbRow, failRow] } };
  const submit = (cfg: Record<string, unknown>, raw: unknown) => {
    const s = schema(cfg);
    return sanitizePublicAnswers(s, mergeChildRows(s, raw, caseAnswers), new Set(), { keepChildRows: true });
  };

  it("strips forged child keys when not a case", () => {
    const raw = [{ id: "gas", type: "table", rows: [{ o2: "5", _child: "fake" }] }];
    expect((sanitizePublicAnswers(schema(), raw, new Set()).answers[1].rows as object[])[0]).toEqual({ o2: "5" });
  });

  it("DB child rows replace forged ones, manual rows kept, pass/fail converted and counted", () => {
    const r = submit({}, [{ id: "gas", type: "table", rows: [{ o2: "5" }, { o2: "99", _child: "L1" }] }]);
    const rows = r.answers[1].rows as Record<string, string>[];
    expect(rows.map((x) => x.o2 ?? null)).toEqual(["5", "20.9", null]);
    expect(rows[1]).toMatchObject({ _child: "L1", ok: "ผ่าน" });
    expect(rows[2]).toMatchObject({ _child: "L2", ok: "ไม่ผ่าน" });
    expect(r.result).toBe("fail");
  });

  it("source_only: only DB child rows survive", () => {
    const rows = submit({ source_only: true }, [{ id: "gas", type: "table", rows: [{ o2: "5" }] }]).answers[1].rows as Record<string, string>[];
    expect(rows.map((x) => x._child)).toEqual(["L1", "L2"]);
  });

  it("table missing from the page still gets child rows", () => {
    const rows = submit({}, []).answers[1].rows as Record<string, string>[];
    expect(rows.map((x) => x._child)).toEqual(["L1", "L2"]);
  });

  it("tables without a button ignore child rows", () => {
    const s = sanitizeSchema({ title: "x", steps: [{ id: "a", title: "a", fields: [{ id: "t", type: "table", label: "t", columns: [{ id: "c", label: "c", type: "text" }] }] }] });
    const out = mergeChildRows(s, [{ id: "t", type: "table", rows: [{ c: "1", _child: "x" }, { c: "2" }] }], { t: { value: [{ c: "9", _child: "y" }] } });
    expect((out[0] as { rows: unknown[] }).rows).toEqual([{ c: "2" }]);
  });
});
