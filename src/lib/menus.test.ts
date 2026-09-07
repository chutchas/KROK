import { describe, it, expect } from "vitest";
import { cleanMenus, ALL_MENU_KEYS } from "./menus";

describe("cleanMenus", () => {
  it("กรองเฉพาะ key ที่ถูกต้อง", () => {
    expect(cleanMenus(["dashboard", "forms", "bogus"])).toEqual(["dashboard", "forms"]);
  });
  it("ตัดค่าซ้ำ", () => {
    expect(cleanMenus(["forms", "forms", "dashboard"])).toEqual(["forms", "dashboard"]);
  });
  it("ค่าไม่ใช่ array → []", () => {
    expect(cleanMenus(null)).toEqual([]);
    expect(cleanMenus("forms")).toEqual([]);
  });
  it("reports เป็น key ที่ถูกต้อง", () => {
    expect(ALL_MENU_KEYS).toContain("reports");
    expect(cleanMenus(["reports"])).toEqual(["reports"]);
  });
});
