import { describe, expect, it } from "vitest";
import { SETTINGS_HUBS, canSee, hubOf } from "../settings-nav";

const ctx = (o: Partial<{ allowed: string[]; isWsAdmin: boolean }> = {}) => ({
  allowed: new Set(o.allowed ?? []), isWsAdmin: !!o.isWsAdmin, isPlatformAdmin: false, platformRole: "user",
});

describe("settings nav", () => {
  it("หาหมวด/แท็บจาก path (เจาะจงที่สุด)", () => {
    expect(hubOf("/settings/billing/history")?.item.href).toBe("/settings/billing/history");
    expect(hubOf("/settings/billing")?.hub.key).toBe("billing");
    expect(hubOf("/settings/roles")?.hub.key).toBe("people");
    expect(hubOf("/settings/audit")?.hub.key).toBe("workspace");
    expect(hubOf("/settings/profile")).toBeNull();
  });
  it("ผู้ใช้ทั่วไปเห็นเฉพาะแท็บที่มีสิทธิ์เมนู · ผู้ดูแลเห็นครบ", () => {
    const visibleHubs = (c: ReturnType<typeof ctx>) => SETTINGS_HUBS.filter((h) => h.items.some((it) => canSee(it, c))).map((h) => h.key);
    expect(visibleHubs(ctx({ allowed: ["team"] }))).toEqual(["people"]);
    expect(visibleHubs(ctx({ allowed: ["team", "integrations", "billing"], isWsAdmin: true }))).toEqual(["people", "workspace", "connect", "billing"]);
  });
});
