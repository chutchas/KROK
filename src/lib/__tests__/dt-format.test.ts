import { describe, it, expect } from "vitest";
import { dtNowValue, formatDtThai } from "@/lib/dt-format";

describe("dt-format", () => {
  it("formats per mode", () => {
    expect(formatDtThai("2026-10-02T22:47")).toBe("2 ต.ค. 2569 22:47 น.");
    expect(formatDtThai("2026-10-02", "date")).toBe("2 ต.ค. 2569");
    expect(formatDtThai("08:05", "time")).toBe("08:05 น.");
    expect(formatDtThai("", "date")).toBe("");
    expect(formatDtThai("bad")).toBe("bad");
  });
  it("now value shape per mode", () => {
    expect(dtNowValue("date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dtNowValue("time")).toMatch(/^\d{2}:\d{2}$/);
    expect(dtNowValue()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
