import { describe, it, expect } from "vitest";
import { tokenCostUsd, groupUsage, monthlyValue, isActivePaid, recentMonths, monthRange, isMonth, type UsageRow } from "./finance-calc";

const row = (p: Partial<UsageRow>): UsageRow => ({ month: "2026-10", purpose: "form_gen", provider: "anthropic", model: "m1", tenantId: "t1", calls: 1, inputTokens: 0, outputTokens: 0, ...p });

describe("finance-calc", () => {
  it("คิดราคา token ต่อ 1 ล้าน", () => {
    expect(tokenCostUsd(1_000_000, 500_000, { model: "m1", inputPerM: 3, outputPerM: 15 })).toBeCloseTo(10.5);
    expect(tokenCostUsd(10, 10, undefined)).toBeNull();
  });

  it("รวมตามคีย์ + ทำเครื่องหมายรุ่นที่ยังไม่มีราคา", () => {
    const prices = new Map([["m1", { model: "m1", inputPerM: 1, outputPerM: 2 }]]);
    const g = groupUsage([
      row({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
      row({ tenantId: "t2", model: "m2", inputTokens: 5_000_000 }),
      row({ calls: 2, inputTokens: 1_000_000 }),
    ], prices, (r) => r.tenantId || "-");
    expect(g[0]).toMatchObject({ key: "t1", calls: 3, usd: 4, unpriced: false });
    expect(g[1]).toMatchObject({ key: "t2", usd: 0, unpriced: true });
  });

  it("MRR ใช้ราคาล็อก ÷ เดือน ไม่งั้นใช้ราคาแพ็กเกจ", () => {
    expect(monthlyValue(990, 9900, 12)).toBe(825);
    expect(monthlyValue(990, null, null)).toBe(990);
    expect(monthlyValue(990, 0, 1)).toBe(990);
  });

  it("นับสมาชิกที่จ่ายอยู่รวมช่วงผ่อนผัน", () => {
    const now = Date.parse("2026-10-05T00:00:00Z");
    expect(isActivePaid("free", null, now)).toBe(false);
    expect(isActivePaid("pro", null, now)).toBe(true);
    expect(isActivePaid("pro", "2026-10-03T00:00:00Z", now)).toBe(true);
    expect(isActivePaid("pro", "2026-09-30T00:00:00Z", now)).toBe(false);
  });

  it("เดือนตามเวลาไทย + ข้ามปี", () => {
    expect(recentMonths(Date.parse("2026-12-31T18:00:00Z"), 3)).toEqual(["2027-01", "2026-12", "2026-11"]);
    expect(recentMonths(Date.parse("2026-02-10T00:00:00Z"), 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
    expect(monthRange("2026-12")).toEqual({ from: "2026-11-30T17:00:00.000Z", to: "2026-12-31T17:00:00.000Z" });
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-01")).toBe(true);
  });
});
