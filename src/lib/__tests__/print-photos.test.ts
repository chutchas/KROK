import { describe, it, expect } from "vitest";
import { printPhotosOf, sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { buildBlocks, autoLayout, blockHeight, photosBlockHeight, mmToPx, PHOTOS_KEY } from "@/lib/paper-layout";

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

describe("paper layout · photo grid block", () => {
  it("thumb: photo fields stay as their own blocks", () => {
    const keys = buildBlocks(base()).map((b) => b.key);
    expect(keys).toContain("p1");
    expect(keys).not.toContain(PHOTOS_KEY);
  });
  it("grid: photo fields move into one photos block at the end (signature stays)", () => {
    const blocks = buildBlocks(base({ print_photos: { mode: "grid", cols: 2, height_mm: 40 } }));
    const keys = blocks.map((b) => b.key);
    expect(keys).not.toContain("p1");
    expect(keys).toContain("sig");
    const pb = blocks[blocks.length - 1];
    expect(pb.key).toBe(PHOTOS_KEY);
    expect(pb.photos?.fields.map((f) => f.id)).toEqual(["p1", "p2", "p3"]);
    expect(blockHeight(pb)).toBe(photosBlockHeight(3, 2, mmToPx(40)));
    const lay = autoLayout(blocks);
    expect(lay[PHOTOS_KEY].w).toBeGreaterThan(600); // เต็มแถว
  });
  it("grid with no photo fields adds no block", () => {
    const s = base({ print_photos: { mode: "grid" } });
    s.steps = [{ id: "s1", title: "A", fields: [{ id: "a", type: "text", label: "A", required: false }] }] as FormSchema["steps"];
    expect(buildBlocks(s).some((b) => b.key === PHOTOS_KEY)).toBe(false);
  });
  it("height grows by rows", () => {
    expect(photosBlockHeight(6, 3, 100)).toBeGreaterThan(photosBlockHeight(3, 3, 100));
    expect(photosBlockHeight(3, 3, 100)).toBe(photosBlockHeight(1, 3, 100));
  });
});
