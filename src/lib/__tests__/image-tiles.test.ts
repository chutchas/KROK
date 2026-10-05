import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import sharp from "sharp";
import { tileForReading } from "@/lib/image-tiles";

const page = async (w: number, h: number) =>
  ({ base64: (await sharp({ create: { width: w, height: h, channels: 3, background: "#ffffff" } }).jpeg().toBuffer()).toString("base64"), mediaType: "image/jpeg" });

describe("tileForReading", () => {
  it("adds zoomed top/bottom halves for a tall page", async () => {
    const out = await tileForReading([await page(2000, 2828)]);
    expect(out).toHaveLength(3);
    expect(out[0].label).toContain("ทั้งหน้า");
    expect(out[1].label).toContain("ครึ่งบน");
    for (const o of out) {
      const m = await sharp(Buffer.from(o.base64, "base64")).metadata();
      expect(Math.max(m.width!, m.height!)).toBeLessThanOrEqual(1600);
    }
    // ครึ่งหน้าแบบขยาย: ตัวหนังสือใหญ่กว่าในรูปทั้งหน้า
    const whole = await sharp(Buffer.from(out[0].base64, "base64")).metadata();
    const top = await sharp(Buffer.from(out[1].base64, "base64")).metadata();
    expect(top.width!).toBeGreaterThan(whole.width! * 1.3);
  });
  it("keeps small/landscape images and long documents as single images", async () => {
    expect(await tileForReading([await page(1200, 800)])).toHaveLength(1);
    const many = await Promise.all(Array.from({ length: 5 }, () => page(2000, 2828)));
    expect(await tileForReading(many)).toHaveLength(5);
  });
  it("falls back to the original on a broken image", async () => {
    const out = await tileForReading([{ base64: "bm90LWFuLWltYWdl", mediaType: "image/jpeg" }]);
    expect(out).toHaveLength(1);
    expect(out[0].base64).toBe("bm90LWFuLWltYWdl");
  });
});
