import { describe, it, expect } from "vitest";
import { getPlan, fmtLimit, PLANS, PLAN_ORDER, UNLIMITED } from "@/lib/plans";

describe("plans", () => {
  it("getPlan falls back to free for unknown/empty keys", () => {
    expect(getPlan("pro").key).toBe("pro");
    expect(getPlan(null).key).toBe("free");
    expect(getPlan("nonsense").key).toBe("free");
  });

  it("fmtLimit shows infinity for unlimited", () => {
    expect(fmtLimit(25)).toBe("25");
    expect(fmtLimit(UNLIMITED)).toBe("∞");
  });

  it("plan order matches catalog and prices ascend", () => {
    expect(PLAN_ORDER).toEqual(["free", "pro", "business"]);
    expect(PLANS.free.priceThb).toBeLessThan(PLANS.pro.priceThb);
    expect(PLANS.pro.priceThb).toBeLessThan(PLANS.business.priceThb);
  });
});
