import { describe, it, expect } from "vitest";
import { PAYMENT_PROVIDERS, PAYMENT_PROVIDER_IDS } from "./payment-meta";

describe("payment-meta", () => {
  it("มี provider ครบ 4 เจ้า", () => {
    expect(PAYMENT_PROVIDER_IDS).toEqual(["stripe", "omise", "2c2p", "promptpay"]);
  });
  it("ทุก provider มี field อย่างน้อยหนึ่งช่อง", () => {
    for (const p of PAYMENT_PROVIDERS) expect(p.fields.length).toBeGreaterThan(0);
  });
  it("provider ที่รับบัตร มี secret key อย่างน้อยหนึ่ง (ยกเว้น promptpay)", () => {
    for (const p of PAYMENT_PROVIDERS) {
      const hasSecret = p.fields.some((f) => f.secret);
      if (p.id === "promptpay") expect(hasSecret).toBe(false);
      else expect(hasSecret).toBe(true);
    }
  });
});
