import { describe, it, expect } from "vitest";
import { signGatewayPayload, verifyGatewaySignature, parseGatewayEvent } from "../billing-sign";

const SECRET = "whsec_test_123456";
const body = JSON.stringify({ id: "evt_1", type: "payment.succeeded" });

describe("gateway signature", () => {
  it("ยอมรับลายเซ็นที่ถูกต้อง", () => {
    const ts = "1790000000";
    expect(verifyGatewaySignature(SECRET, body, ts, signGatewayPayload(SECRET, ts, body), 1790000100)).toEqual({ ok: true });
  });
  it("ปฏิเสธ body ที่ถูกแก้ / secret ผิด / เวลาเก่า / ไม่มี header", () => {
    const ts = "1790000000";
    const sig = signGatewayPayload(SECRET, ts, body);
    expect(verifyGatewaySignature(SECRET, body + " ", ts, sig, 1790000000).ok).toBe(false);
    expect(verifyGatewaySignature("other", body, ts, sig, 1790000000).ok).toBe(false);
    expect(verifyGatewaySignature(SECRET, body, ts, sig, 1790000400)).toEqual({ ok: false, reason: "stale" });
    expect(verifyGatewaySignature(SECRET, body, null, sig)).toEqual({ ok: false, reason: "missing" });
  });
});

describe("parseGatewayEvent", () => {
  const good = { id: "evt_1", type: "payment.succeeded", data: { payment_id: "pay_1", reference: "33333333-3333-3333-3333-333333333331", amount: 99000, currency: "thb" } };
  it("อ่าน payload ที่ครบ", () => {
    expect(parseGatewayEvent(good)?.data.currency).toBe("THB");
  });
  it("ปฏิเสธ reference ไม่ใช่ uuid / ยอดไม่ใช่จำนวนเต็ม", () => {
    expect(parseGatewayEvent({ ...good, data: { ...good.data, reference: "x" } })).toBeNull();
    expect(parseGatewayEvent({ ...good, data: { ...good.data, amount: 990.5 } })).toBeNull();
    expect(parseGatewayEvent(null)).toBeNull();
  });
});
