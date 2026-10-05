import { describe, it, expect } from "vitest";
import { clampFilledAt, isLateSync } from "./filled-at";

describe("filled-at", () => {
  const now = Date.parse("2026-10-05T10:00:00Z");
  it("รับเวลาย้อนหลังไม่เกิน 7 วัน", () => {
    expect(clampFilledAt(now - 3600_000, now)).toBe("2026-10-05T09:00:00.000Z");
    expect(clampFilledAt(now - 8 * 86400_000, now)).toBeNull();
  });
  it("นาฬิกาเร็วเล็กน้อย = ใช้เวลาปัจจุบัน · เร็วมาก = ไม่รับ", () => {
    expect(clampFilledAt(now + 60_000, now)).toBe(new Date(now).toISOString());
    expect(clampFilledAt(now + 10 * 60_000, now)).toBeNull();
  });
  it("ค่าเสีย = null", () => {
    expect(clampFilledAt("x", now)).toBeNull();
    expect(clampFilledAt(undefined, now)).toBeNull();
    expect(clampFilledAt(0, now)).toBeNull();
  });
  it("ใบที่ sync ทีหลัง", () => {
    expect(isLateSync("2026-10-05T09:00:00Z", "2026-10-05T14:00:00Z")).toBe(true);
    expect(isLateSync("2026-10-05T09:00:00Z", "2026-10-05T09:01:00Z")).toBe(false);
    expect(isLateSync(null, "2026-10-05T09:01:00Z")).toBe(false);
  });
});
