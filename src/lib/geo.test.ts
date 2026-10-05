import { describe, expect, it } from "vitest";
import { sanitizeGeo, watermarkLines, mapUrl } from "./geo";

const now = Date.parse("2026-10-05T10:00:00Z");

describe("sanitizeGeo", () => {
  it("รับค่าปกติ + ปัดทศนิยม", () => {
    expect(sanitizeGeo({ lat: 13.7563309, lng: 100.5017651, acc: 12.4, at: now - 1000 }, now)).toEqual({ lat: 13.756331, lng: 100.501765, acc: 12, at: now - 1000 });
  });
  it("ไม่รับค่าผิด/เก่าเกิน/0,0", () => {
    expect(sanitizeGeo({ lat: 91, lng: 0 }, now)).toBeNull();
    expect(sanitizeGeo({ lat: 0, lng: 0, at: now }, now)).toBeNull();
    expect(sanitizeGeo({ lat: "x", lng: 1 }, now)).toBeNull();
    expect(sanitizeGeo({ lat: 13, lng: 100, at: now - 9 * 86400_000 }, now)).toBeNull();
    expect(sanitizeGeo(null, now)).toBeNull();
  });
  it("เวลาในอนาคตถูกตัด", () => {
    expect(sanitizeGeo({ lat: 13, lng: 100, at: now + 3600_000 }, now)?.at).toBe(now + 120_000);
  });
});

describe("watermarkLines", () => {
  it("เวลาไทย + พิกัด + ชื่อฟอร์ม", () => {
    expect(watermarkLines({ atMs: now, title: "ตรวจถัง", geo: { lat: 13.5, lng: 100.25, acc: 8, at: now }, geoOn: true }))
      .toEqual(["05/10/2026 17:00:00 (UTC+7)", "13.500000, 100.250000 ±8m", "ตรวจถัง"]);
    expect(watermarkLines({ atMs: now, title: "", geoOn: true })).toEqual(["05/10/2026 17:00:00 (UTC+7)", "GPS: —"]);
    expect(watermarkLines({ atMs: now, title: "A", geoOn: false })).toHaveLength(2);
  });
  it("mapUrl", () => expect(mapUrl({ lat: 1, lng: 2 })).toBe("https://www.google.com/maps?q=1,2"));
});
