import { describe, it, expect } from "vitest";
import { sanitizeChildForm, sanitizeSchema, isUiOnlyField } from "@/lib/form-schema";
import { sanitizePublicAnswers } from "@/lib/public-answers";
import { childRowsFromCase } from "@/lib/child-rows";
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
  const caseAnswers = { gas: { value: [{ o2: "1" }, dbRow, failRow] }, loc: { value: "x" } };
  const submit = (cfg: Record<string, unknown>, raw: unknown) =>
    sanitizePublicAnswers(schema(cfg), raw, new Set(), { childRows: childRowsFromCase(caseAnswers) });
  const gasRows = (r: ReturnType<typeof submit>) => r.answers.find((a) => a.id === "gas")!.rows as Record<string, string>[];

  it("childRowsFromCase keeps only _child rows", () => {
    expect(childRowsFromCase(caseAnswers)).toEqual({ gas: [dbRow, failRow] });
  });

  it("drops forged child rows when not a case", () => {
    const raw = [{ id: "gas", type: "table", rows: [{ o2: "5", _child: "fake" }, { o2: "6" }] }];
    expect(gasRows(sanitizePublicAnswers(schema(), raw, new Set()))).toEqual([{ o2: "6" }]);
  });

  it("DB child rows replace forged ones, manual rows kept, pass/fail converted and counted", () => {
    const r = submit({}, [{ id: "gas", type: "table", rows: [{ o2: "5" }, { o2: "99", _child: "L1" }] }]);
    const rows = gasRows(r);
    // แถว L1 ที่หน้ากรอกส่งกลับมา (o2=99) ถูกทิ้ง → ไม่ซ้ำ และใช้ค่าจริงจากฐานข้อมูล
    expect(rows.map((x) => x.o2 ?? null)).toEqual(["5", "20.9", null]);
    expect(rows.filter((x) => x._child).map((x) => x.ok)).toEqual(["ผ่าน", "ไม่ผ่าน"]);
    expect(r.result).toBe("fail");
  });

  it("attack: table item without rows → DB rows still there, still fails", () => {
    const r = submit({}, [{ id: "gas", type: "table", label: "ผลวัด" }]);
    expect(gasRows(r).map((x) => x._child)).toEqual(["L1", "L2"]);
    expect(r.result).toBe("fail");
  });

  it("attack: id on wrong type + table matched by label → DB rows still there", () => {
    const r = submit({ source_only: true }, [{ id: "gas", type: "text", rows: [] }, { id: "x", label: "ผลวัด", type: "table", rows: [{ ok: "pass" }] }]);
    expect(gasRows(r).map((x) => x._child)).toEqual(["L1", "L2"]);
    expect(r.result).toBe("fail");
  });

  it("attack: 500 manual rows cannot push DB rows out", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ o2: String(i) }));
    const rows = gasRows(submit({}, [{ id: "gas", type: "table", rows: many }]));
    expect(rows.length).toBe(500);
    expect(rows.slice(-2).map((x) => x._child)).toEqual(["L1", "L2"]);
  });

  it("source_only: only DB child rows survive", () => {
    expect(gasRows(submit({ source_only: true }, [{ id: "gas", type: "table", rows: [{ o2: "5" }] }])).map((x) => x._child)).toEqual(["L1", "L2"]);
  });

  it("source_only without a case (e.g. direct/intake) → table empty", () => {
    const r = sanitizePublicAnswers(schema({ source_only: true }), [{ id: "gas", type: "table", rows: [{ o2: "5", ok: "pass" }] }], new Set());
    expect(gasRows(r)).toEqual([]);
  });

  it("tables without a button ignore child rows", () => {
    const s = sanitizeSchema({ title: "x", steps: [{ id: "a", title: "a", fields: [{ id: "t", type: "table", label: "t", columns: [{ id: "c", label: "c", type: "text" }] }] }] });
    const r = sanitizePublicAnswers(s, [{ id: "t", type: "table", rows: [{ c: "2", _child: "x" }, { c: "3" }] }], new Set(), { childRows: { t: [{ c: "9", _child: "y" }] } });
    expect(r.answers[0].rows).toEqual([{ c: "3" }]);
  });
});
