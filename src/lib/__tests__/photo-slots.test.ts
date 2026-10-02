import { describe, it, expect } from "vitest";
import { photoSlotKey, parsePhotoSlotKey, maxPhotosOf, minPhotosOf, filledPhotoKeys, answerPhotoKeys, allPhotoSlotKeys } from "@/lib/photo-slots";
import { sanitizeSchema, type FormField, type FormSchema } from "@/lib/form-schema";
import { buildBlocks, PHOTOS_KEY } from "@/lib/paper-layout";
import { sanitizePublicAnswers } from "@/lib/public-answers";
import { isRowPhotoKey, mediaFieldId } from "@/lib/table-rows";

const ph = (extra: Partial<FormField> = {}): FormField => ({ id: "p", type: "photo", label: "รูป", required: false, ...extra } as FormField);

describe("photo slot keys", () => {
  it("slot 0 = field id (backward compatible), others follow media-key shape", () => {
    expect(photoSlotKey("p", 0)).toBe("p");
    expect(photoSlotKey("p", 3)).toBe("p.ph.slot03");
    expect(isRowPhotoKey("p.ph.slot03")).toBe(true); // ใช้ทาง upload/แบบร่างเดิมได้
    expect(mediaFieldId("p.ph.slot03")).toBe("p");
    expect(parsePhotoSlotKey("p.ph.slot03")).toEqual({ fieldId: "p", slot: 3 });
    expect(parsePhotoSlotKey("p")).toEqual({ fieldId: "p", slot: 0 });
    expect(parsePhotoSlotKey("../x")).toBeNull();
  });
  it("max/min photos", () => {
    expect(maxPhotosOf(ph())).toBe(1);
    expect(maxPhotosOf(ph({ max_photos: 4 }))).toBe(4);
    expect(maxPhotosOf(ph({ max_photos: 99 }))).toBe(12);
    expect(minPhotosOf(ph({ max_photos: 4 }))).toBe(0);
    expect(minPhotosOf(ph({ max_photos: 4, required: true }))).toBe(1);
    expect(minPhotosOf(ph({ max_photos: 4, min_photos: 3, required: true }))).toBe(3);
    expect(minPhotosOf(ph({ max_photos: 2, min_photos: 5, required: true }))).toBe(2);
  });
  it("filled keys keep slot order and skip gaps", () => {
    const have = new Set(["p", "p.ph.slot02"]);
    expect(filledPhotoKeys(ph({ max_photos: 3 }), (k) => have.has(k))).toEqual(["p", "p.ph.slot02"]);
    expect(allPhotoSlotKeys(ph({ max_photos: 2 }))).toEqual(["p", "p.ph.slot01"]);
  });
  it("answerPhotoKeys supports old single-photo answers", () => {
    expect(answerPhotoKeys({ photoField: "p" })).toEqual(["p"]);
    expect(answerPhotoKeys({ photoField: "p", photoFields: ["p", "p.ph.slot01"] })).toEqual(["p", "p.ph.slot01"]);
    expect(answerPhotoKeys({})).toEqual([]);
  });
});

const schema = (f: Partial<FormField>): FormSchema => ({ title: "t", description: "", icon: "", flow: "sequential", steps: [{ id: "s", title: "S", fields: [ph(f)] }] } as FormSchema);

describe("schema + layout + public answers", () => {
  it("sanitize keeps max/min photos only when > 1", () => {
    const f = sanitizeSchema(schema({ max_photos: 4, min_photos: 2 })).steps[0].fields[0];
    expect(f.max_photos).toBe(4);
    expect(f.min_photos).toBe(2);
    const g = sanitizeSchema(schema({ max_photos: 1, min_photos: 1 })).steps[0].fields[0];
    expect(g.max_photos).toBeUndefined();
    expect(g.min_photos).toBeUndefined();
  });
  it("grid box has one cell per slot", () => {
    const s = { ...schema({ max_photos: 4 }), print_photos: { mode: "grid" as const } };
    const b = buildBlocks(s).find((x) => x.key === PHOTOS_KEY)!;
    expect(b.photos?.cells.map((c) => c.slot)).toEqual([0, 1, 2, 3]);
  });
  it("public answers keep only uploaded slots in order", () => {
    const r = sanitizePublicAnswers(schema({ max_photos: 3 }), [{ label: "รูป", type: "photo" }], new Set(["p.ph.slot02", "p"]));
    expect(r.answers[0]).toMatchObject({ photoField: "p", photoFields: ["p", "p.ph.slot02"] });
  });
});
