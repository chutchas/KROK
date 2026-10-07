import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("รับ path ภายใน", () => {
    expect(safeNextPath("/forms?tab=today#x")).toBe("/forms?tab=today#x");
    expect(safeNextPath("/settings/billing")).toBe("/settings/billing");
  });
  it("ไม่รับลิงก์ออกนอกเว็บ", () => {
    for (const bad of ["//evil.com", "/\t/evil.com", "/\\evil.com", "https://evil.com", "evil.com", "/%09/evil.com".replace("%09", "\t"), " /x", "/\n/evil.com", ""])
      expect(safeNextPath(bad)).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});
