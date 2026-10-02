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

describe("keepClearOnGrow / placeUnstoredPhotosBox", () => {
  it("pushes blocks below the photo box down when it grows", async () => {
    const { keepClearOnGrow, resolveLayout } = await import("@/lib/paper-layout");
    const prev = base({ print_photos: { mode: "grid", cols: 3, height_mm: 40 } });
    prev.steps[1].fields = prev.steps[1].fields.filter((f) => f.type !== "photo" || f.id === "p2");
    prev.layout = { photos: { x: 40, y: 400, w: 714 }, sig: { x: 40, y: 600, w: 300 }, a: { x: 40, y: 150, w: 300 } };
    const next = { ...prev, steps: prev.steps.map((s) => ({ ...s, fields: s.fields.map((f) => (f.id === "p2" ? { ...f, max_photos: 6 } : f)) })) };
    const out = keepClearOnGrow(prev, next);
    expect(out.layout!.sig.y).toBeGreaterThan(600); // ดันลง
    expect(out.layout!.a.y).toBe(150);               // ช่องด้านบนไม่ขยับ
    const lay = resolveLayout(out);
    expect(lay.sig.y).toBeGreaterThanOrEqual(lay.photos.y + blockHeight(buildBlocks(out).find((b) => b.key === PHOTOS_KEY)!));
  });
  it("new photo box goes below manually placed blocks", async () => {
    const { resolveLayout } = await import("@/lib/paper-layout");
    const s = base({ print_photos: { mode: "grid" } });
    s.layout = { sig: { x: 40, y: 900, w: 300 } };
    expect(resolveLayout(s).photos.y).toBeGreaterThan(900);
  });
});

describe("reflowTops · designed overlap", () => {
  it("moves a block that starts inside the box above it to below that box", async () => {
    const { reflowTops } = await import("@/lib/paper-layout");
    const s = base({ print_photos: { mode: "grid", cols: 3, height_mm: 40 } });
    s.layout = { photos: { x: 40, y: 400, w: 714 }, sig: { x: 40, y: 450, w: 300 }, a: { x: 420, y: 100, w: 300 } };
    const bl = buildBlocks(s);
    const lay = (await import("@/lib/paper-layout")).resolveLayout(s, bl);
    const tops = reflowTops(bl, lay, {}, true);
    expect(reflowTops(bl, lay, {}).sig).toBe(450); // หน้าออกแบบ: ไม่ขยับ
    const ph = bl.find((b) => b.key === PHOTOS_KEY)!;
    expect(tops.sig).toBeGreaterThanOrEqual(400 + blockHeight(ph));
  });
});
