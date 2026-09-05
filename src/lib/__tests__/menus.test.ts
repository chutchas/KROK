import { describe, it, expect } from "vitest";
import { cleanMenus, ALL_MENU_KEYS } from "@/lib/menus";

describe("cleanMenus", () => {
  it("keeps only valid menu keys", () => {
    expect(cleanMenus(["forms", "dashboard", "hacker", 123, null])).toEqual(["forms", "dashboard"]);
  });

  it("dedupes and returns empty for non-arrays", () => {
    expect(cleanMenus(["forms", "forms"])).toEqual(["forms"]);
    expect(cleanMenus("forms")).toEqual([]);
    expect(cleanMenus(undefined)).toEqual([]);
  });

  it("accepts the full known set", () => {
    expect(cleanMenus(ALL_MENU_KEYS).sort()).toEqual([...ALL_MENU_KEYS].sort());
  });
});
