import { describe, it, expect } from "vitest";
import { linesOf, normalizeThai, usableText } from "@/lib/pdf-text";

describe("pdf text", () => {
  it("orders items into lines top→bottom, left→right", () => {
    const t = linesOf([
      { str: "วันที่", transform: [1, 0, 0, 1, 300, 700] },
      { str: "ใบตรวจรับสินค้า", transform: [1, 0, 0, 1, 50, 760] },
      { str: "ผู้ตรวจ", transform: [1, 0, 0, 1, 50, 701] },
    ]);
    expect(t.split("\n")).toEqual(["ใบตรวจรับสินค้า", "ผู้ตรวจ  วันที่"]);
  });
  it("accepts real Thai text and rejects garbled font output", () => {
    expect(usableText("ใบตรวจรับสินค้า ผู้ตรวจ วันที่ เลขที่เอกสาร หมายเหตุ")).toBe(true);
    expect(usableText(" abcdefghijklmnopq ")).toBe(false);
    expect(usableText("สั้น")).toBe(false);
  });
  it("repairs common Thai extraction artifacts", () => {
    expect(normalizeThai("สภาพ  \u0000 ปกติ  \u0000 ชำารุด")).toBe("สภาพ   ปกติ   ชำรุด".replace(/ {3}/g, "  "));
    expect(normalizeThai("ช\u0E4D\u0E32รุด")).toBe("ชำรุด");
  });
});
