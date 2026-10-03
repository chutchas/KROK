import { describe, it, expect } from "vitest";
import type { FormSchema } from "@/lib/form-schema";
import { duplicateField, moveInOrder, orderedKeys, parseClip, removeBlock, serializeClip } from "@/lib/editor-ops";

const base = (): FormSchema => ({
  title: "t", description: "", icon: "x", flow: "sequential",
  steps: [
    { id: "s1", title: "A", fields: [{ id: "a", label: "a", type: "text", required: false }, { id: "b", label: "b", type: "text", required: false }] },
    { id: "s2", title: "B", fields: [{ id: "c", label: "c", type: "number", required: true }] },
  ],
  layout: { a: { x: 40, y: 100, w: 300 }, b: { x: 40, y: 160, w: 300 }, c: { x: 40, y: 260, w: 300 }, "s:s2": { x: 40, y: 220, w: 700 } },
});

describe("editor ops", () => {
  it("removes fields and their paper boxes", () => {
    const s = removeBlock(base(), "b")!;
    expect(s.steps[0].fields.map((f) => f.id)).toEqual(["a"]);
    expect(s.layout?.b).toBeUndefined();
  });
  it("removes a step with its fields but never the last step", () => {
    const s = removeBlock(base(), "s:s2")!;
    expect(s.steps).toHaveLength(1);
    expect(s.layout?.c).toBeUndefined();
    expect(removeBlock(s, "s:s1")).toBeNull();
  });
  it("hides header/meta instead of deleting", () => {
    expect(removeBlock(base(), "header")?.show_header).toBe(false);
    expect(removeBlock(base(), "meta")?.show_meta).toBe(false);
  });
  it("duplicates right after the original with a shifted box", () => {
    const s = duplicateField(base(), "a", "a2")!;
    expect(s.steps[0].fields.map((f) => f.id)).toEqual(["a", "a2", "b"]);
    expect(s.layout?.a2).toEqual({ x: 56, y: 116, w: 300 });
  });
  it("moves fields in fill order across step boundaries", () => {
    const down = moveInOrder(base(), "b", 1)!;
    expect(down.steps[0].fields.map((f) => f.id)).toEqual(["a"]);
    expect(down.steps[1].fields.map((f) => f.id)).toEqual(["b", "c"]);
    expect(moveInOrder(base(), "a", -1)).toBeNull();
    expect(moveInOrder(base(), "s:s2", -1)!.steps.map((x) => x.id)).toEqual(["s2", "s1"]);
  });
  it("orders blocks for Tab", () => {
    expect(orderedKeys(base())).toEqual(["header", "meta", "s:s1", "a", "b", "s:s2", "c"]);
  });
  it("round-trips clipboard text and ignores other text", () => {
    const f = base().steps[1].fields[0];
    expect(parseClip(serializeClip(f))).toEqual(f);
    expect(parseClip("hello")).toBeNull();
    expect(parseClip('{"krok-field/v1": 5}')).toBeNull();
  });
});
