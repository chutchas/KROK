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
