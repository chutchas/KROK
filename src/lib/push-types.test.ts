import { describe, expect, it } from "vitest";
import { cleanOffGroups, pushGroupOf, urlB64ToBytes } from "./push-types";

describe("push-types", () => {
  it("จัดกลุ่ม", () => {
    expect(pushGroupOf("schedule_overdue")).toBe("schedule");
    expect(pushGroupOf("approved")).toBe("approval");
    expect(pushGroupOf("whatever")).toBeNull();
  });
  it("กรองค่าที่ไม่รู้จัก", () => expect(cleanOffGroups(["case", "x", "case", 3])).toEqual(["case"]));
  it("base64url → bytes", () => expect([...urlB64ToBytes("AQID_w")]).toEqual([1, 2, 3, 255]));
});

import { isPushEndpoint, safePushLink } from "./push-types";
describe("isPushEndpoint / safePushLink", () => {
  it("รับเฉพาะบริการ push จริง", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc123def456")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/xyz")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/QOabc123")).toBe(true);
    expect(isPushEndpoint("https://wns2-sg2p.notify.windows.com/w/?token=abc")).toBe(true);
    expect(isPushEndpoint("https://evil.com/fcm.googleapis.com/x")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com.evil.com/x123456789")).toBe(false);
    expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc123def")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com:8443/fcm/send/abc")).toBe(false);
  });
  it("ลิงก์ภายในเท่านั้น", () => {
    expect(safePushLink("/fill/abc")).toBe("/fill/abc");
    expect(safePushLink("//evil.com")).toBe("/dashboard");
    expect(safePushLink("/\\evil.com")).toBe("/dashboard");
    expect(safePushLink("https://evil.com")).toBe("/dashboard");
  });
});
