import { describe, it, expect } from "vitest";
import { sanitizeChildForm, sanitizeSchema, isUiOnlyField } from "@/lib/form-schema";
import { sanitizePublicAnswers } from "@/lib/public-answers";
import { applyChildRows } from "@/lib/child-rows";
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
            child_form: { form_id: FID, send: [{ to: "c_loc", from: "loc" }], table_id: "gas", map: [{ col: "o2", from: "c_o2" }, { col: "pic", from: "c_pic" }], ...cfg } },
          { id: "gas", type: "table", label: "ผลวัด", columns: [{ id: "o2", label: "O2", type: "number" }, { id: "pic", label: "รูป", type: "photo" }] },
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
    expect(schema().steps[1].fields[0].child_form?.map).toEqual([{ col: "o2", from: "c_o2" }]);
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
  const dbRow = { _child: "L1", _src: "วัดแก๊ส #AB", _sub: "S1", _at: "2026-10-08T00:00:00Z", o2: "20.9" };
  const caseAnswers = { gas: { value: [{ o2: "1" }, dbRow] } };

  it("strips forged child keys unless kept", () => {
    const s = schema();
    const raw = [{ id: "gas", type: "table", rows: [{ o2: "5", _child: "fake" }] }];
    expect((sanitizePublicAnswers(s, raw, new Set()).answers[1].rows as object[])[0]).toEqual({ o2: "5" });
    expect((sanitizePublicAnswers(s, raw, new Set(), { keepChildRows: true }).answers[1].rows as object[])[0]).toEqual({ o2: "5", _child: "fake" });
  });

  it("replaces child rows with the DB copy, keeps manual rows", () => {
    const answers: Record<string, unknown>[] = [{ id: "gas", type: "table", rows: [{ o2: "5" }, { o2: "99", _child: "L1" }] }];
    applyChildRows(schema(), answers, caseAnswers);
    expect(answers[0].rows).toEqual([{ o2: "5" }, dbRow]);
  });

  it("source_only: only DB child rows survive", () => {
    const answers: Record<string, unknown>[] = [{ id: "gas", type: "table", rows: [{ o2: "5" }] }];
    applyChildRows(schema({ source_only: true }), answers, caseAnswers);
    expect(answers[0].rows).toEqual([dbRow]);
  });

  it("tables without a button lose child keys", () => {
    const s = sanitizeSchema({ title: "x", steps: [{ id: "a", title: "a", fields: [{ id: "t", type: "table", label: "t", columns: [{ id: "c", label: "c", type: "text" }] }] }] });
    const answers: Record<string, unknown>[] = [{ id: "t", type: "table", rows: [{ c: "1", _child: "x", _sub: "y" }] }];
    applyChildRows(s, answers, {});
    expect(answers[0].rows).toEqual([{ c: "1" }]);
  });
});
