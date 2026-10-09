import { describe, expect, it } from "vitest";
import { pagedHeight, paginateTops } from "@/lib/paper-paginate";
import { matchAnswersToFields } from "@/lib/doc-answers";
import type { FormSchema } from "@/lib/form-schema";

describe("paginateTops", () => {
  it("keeps blocks that fit on the first page", () => {
    const r = paginateTops([{ key: "a", top: 100, h: 62 }, { key: "b", top: 172, h: 62 }], 1000, 40, 20);
    expect(r.tops).toEqual({ a: 100, b: 172 });
    expect(r.bottom).toBe(234);
  });

  it("moves a block crossing the page edge to the next page and shifts everything below", () => {
    const r = paginateTops([{ key: "a", top: 950, h: 62 }, { key: "b", top: 1020, h: 62 }], 1000, 40, 20);
    expect(r.tops.a).toBe(1040);
    expect(r.tops.b).toBe(1110);
  });

  it("moves blocks on the same row together", () => {
    const r = paginateTops([{ key: "l", top: 960, h: 30 }, { key: "r", top: 960, h: 62 }], 1000, 40, 20);
    expect(r.tops.l).toBe(1040);
    expect(r.tops.r).toBe(1040);
  });

  it("does not move a block taller than one page", () => {
    const r = paginateTops([{ key: "t", top: 500, h: 1500 }], 1000, 40, 20);
    expect(r.tops.t).toBe(500);
  });

  it("pushes a block out of the next page's top margin", () => {
    const r = paginateTops([{ key: "a", top: 1005, h: 20 }], 1000, 40, 20);
    expect(r.tops.a).toBe(1040);
  });

  it("rounds the canvas up to whole pages", () => {
    expect(pagedHeight(10, 1000)).toBe(1000);
    expect(pagedHeight(1001, 1000)).toBe(2000);
  });
});

describe("matchAnswersToFields", () => {
  const schema = {
    steps: [{ title: "s", fields: [
      { id: "f1", type: "text", label: "ชื่อ", required: false },
      { id: "c1", type: "child_form", label: "ลูก", required: false },
      { id: "f2", type: "number", label: "ค่า", required: false },
      { id: "f3", type: "text", label: "ชื่อ", required: false },
    ] }],
  } as unknown as FormSchema;

  it("matches by id first", () => {
    const m = matchAnswersToFields(schema, [
      { id: "f3", label: "ชื่อ", type: "text", display: "B" },
      { id: "f1", label: "ชื่อ", type: "text", display: "A" },
    ]);
    expect(m.f1.display).toBe("A");
    expect(m.f3.display).toBe("B");
    expect(m.f2).toBeUndefined();
  });

  it("falls back to label + type in order for old answers without id", () => {
    const m = matchAnswersToFields(schema, [
      { label: "ชื่อ", type: "text", display: "A" },
      { label: "ค่า", type: "number", display: "5" },
      { label: "ชื่อ", type: "text", display: "B" },
    ]);
    expect(m.f1.display).toBe("A");
    expect(m.f2.display).toBe("5");
    expect(m.f3.display).toBe("B");
  });

  it("ignores an id match whose type changed", () => {
    const m = matchAnswersToFields(schema, [{ id: "f2", label: "ค่า", type: "text", display: "x" }]);
    expect(m.f2).toBeUndefined();
  });
});

describe("paginateTops keepWithNext", () => {
  it("moves a step header together with the block that goes to the next page", () => {
    const r = paginateTops([{ key: "s", top: 900, h: 34, keepWithNext: true }, { key: "t", top: 944, h: 300 }], 1000, 40, 20);
    expect(r.tops.s).toBe(1040);
    expect(r.tops.t).toBe(1084);
  });
  it("leaves a step header alone when its next block fits", () => {
    const r = paginateTops([{ key: "s", top: 100, h: 34, keepWithNext: true }, { key: "t", top: 144, h: 62 }], 1000, 40, 20);
    expect(r.tops).toEqual({ s: 100, t: 144 });
  });
});
