import { describe, it, expect } from "vitest";
import { printPhotosOf, sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { buildBlocks, autoLayout, blockHeight, photosBlockHeight, mmToPx } from "@/lib/paper-layout";

const base = (extra: Partial<FormSchema> = {}): FormSchema => ({
  title: "t", description: "", icon: "", flow: "sequential",
  steps: [
    { id: "s1", title: "A", fields: [{ id: "a", type: "text", label: "A", required: false }, { id: "p1", type: "photo", label: "รูป 1", required: false }] },
    { id: "s2", title: "B", fields: [{ id: "p2", type: "photo", label: "รูป 2", required: false }, { id: "p3", type: "photo", label: "รูป 3", required: false }, { id: "sig", type: "signature", label: "เซ็น", required: false }] },
  ],
  ...extra,
} as FormSchema);

describe("printPhotosOf", () => {
  it("defaults to thumb with 3 cols / 45mm", () => {
    expect(printPhotosOf({})).toEqual({ mode: "thumb", cols: 3, height_mm: 45 });
  });
  it("clamps cols and height", () => {
    expect(printPhotosOf({ print_photos: { mode: "grid", cols: 9, height_mm: 500 } })).toEqual({ mode: "grid", cols: 4, height_mm: 120 });
    expect(printPhotosOf({ print_photos: { mode: "appendix", cols: 0, height_mm: 1 } })).toEqual({ mode: "appendix", cols: 1, height_mm: 20 });
  });
});

describe("sanitizeSchema print_photos", () => {
  it("keeps a valid setting and the photos layout box", () => {
    const s = sanitizeSchema({ ...base(), print_photos: { mode: "grid", cols: 2, height_mm: 60 }, layout: { photos: { x: 40, y: 500, w: 700 }, bogus: { x: 1, y: 1, w: 100 } } });
    expect(s.print_photos).toEqual({ mode: "grid", cols: 2, height_mm: 60 });
    expect(s.layout?.photos).toEqual({ x: 40, y: 500, w: 700 });
    expect(s.layout?.bogus).toBeUndefined();
  });
  it("drops thumb (default) and invalid modes", () => {
    expect(sanitizeSchema({ ...base(), print_photos: { mode: "thumb" } }).print_photos).toBeUndefined();
    expect(sanitizeSchema({ ...base(), print_photos: { mode: "weird" } }).print_photos).toBeUndefined();
  });
});

describe("paper layout · photo boxes (grid mode)", () => {
  it("thumb: photo fields are normal field blocks", () => {
    const b = buildBlocks(base()).find((x) => x.key === "p1")!;
    expect(b.kind).toBe("field");
  });
  it("grid: each photo field is its own box, in place, with one cell per photo", () => {
    const s = base({ print_photos: { mode: "grid", cols: 2, height_mm: 40 } });
    s.steps[1].fields = s.steps[1].fields.map((f) => (f.id === "p2" ? { ...f, max_photos: 4 } : f));
    const blocks = buildBlocks(s);
    const keys = blocks.map((b) => b.key);
    expect(keys).toEqual(["s:s1", "a", "p1", "s:s2", "p2", "p3", "sig"]); // ลำดับเดิม
    const p2 = blocks.find((b) => b.key === "p2")!;
    expect(p2.kind).toBe("photos");
    expect(p2.photos?.cells.length).toBe(4);
    expect(blockHeight(p2)).toBe(photosBlockHeight(4, 2, mmToPx(40)));
    expect(blocks.find((b) => b.key === "p1")!.photos?.cells.length).toBe(1);
    expect(autoLayout(blocks).p2.w).toBeGreaterThan(600); // เต็มแถว
  });
  it("height grows by rows", () => {
    expect(photosBlockHeight(6, 3, 100)).toBeGreaterThan(photosBlockHeight(3, 3, 100));
    expect(photosBlockHeight(3, 3, 100)).toBe(photosBlockHeight(1, 3, 100));
  });
});

describe("keepClearOnGrow", () => {
  it("pushes blocks below a photo box down when it gets more photos", async () => {
    const { keepClearOnGrow, resolveLayout } = await import("@/lib/paper-layout");
    const prev = base({ print_photos: { mode: "grid", cols: 3, height_mm: 40 } });
    prev.layout = { p2: { x: 40, y: 400, w: 714 }, p3: { x: 40, y: 640, w: 714 }, sig: { x: 40, y: 900, w: 300 }, a: { x: 40, y: 150, w: 300 } };
    const next = { ...prev, steps: prev.steps.map((s) => ({ ...s, fields: s.fields.map((f) => (f.id === "p2" ? { ...f, max_photos: 6 } : f)) })) };
    const out = keepClearOnGrow(prev, next);
    expect(out.layout!.p3.y).toBeGreaterThan(640);
    expect(out.layout!.a.y).toBe(150);
    const lay = resolveLayout(out);
    expect(lay.p3.y).toBeGreaterThanOrEqual(lay.p2.y + blockHeight(buildBlocks(out).find((b) => b.key === "p2")!));
  });
});

describe("reflowTops · designed overlap", () => {
  it("fill/print moves a block that starts inside the box above it; editor keeps it", async () => {
    const { reflowTops, resolveLayout } = await import("@/lib/paper-layout");
    const s = base({ print_photos: { mode: "grid", cols: 3, height_mm: 40 } });
    s.layout = { p2: { x: 40, y: 400, w: 714 }, sig: { x: 40, y: 450, w: 300 } };
    const bl = buildBlocks(s);
    const lay = resolveLayout(s, bl);
    expect(reflowTops(bl, lay, {}).sig).toBe(450);
    expect(reflowTops(bl, lay, {}, true).sig).toBeGreaterThanOrEqual(400 + blockHeight(bl.find((b) => b.key === "p2")!));
  });
});
