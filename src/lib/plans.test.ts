import { describe, it, expect } from "vitest";
import { effectivePlans, PLANS, UNLIMITED } from "./plans";

describe("effectivePlans", () => {
  it("คืนค่า default เมื่อไม่มี override", () => {
    const p = effectivePlans({});
    expect(p.free.priceThb).toBe(PLANS.free.priceThb);
    expect(p.pro.maxForms).toBe(PLANS.pro.maxForms);
    expect(p.business.maxForms).toBe(UNLIMITED);
  });

  it("override ราคา/โควตา ทับค่า default และคำนวณ label", () => {
    const p = effectivePlans({ pro: { priceThb: 1290, maxForms: 40 } });
    expect(p.pro.priceThb).toBe(1290);
    expect(p.pro.maxForms).toBe(40);
    expect(p.pro.priceLabel).toContain("1,290");
    // ฟิลด์ที่ไม่ได้ override ต้องคงเดิม
    expect(p.pro.maxMembers).toBe(PLANS.pro.maxMembers);
  });

  it("override ชื่อแพ็กเกจได้ และ trim/ค่าว่างใช้ default", () => {
    const p = effectivePlans({ free: { name: " เริ่มต้นใหม่ ", nameEn: "" } });
    expect(p.free.name).toBe("เริ่มต้นใหม่");
    expect(p.free.nameEn).toBe(PLANS.free.nameEn); // ว่าง → default
  });

  it("ค่าลบ/ไม่ใช่ตัวเลข ถูกปฏิเสธ ใช้ default แทน", () => {
    const p = effectivePlans({ free: { maxForms: -5 } });
    expect(p.free.maxForms).toBe(PLANS.free.maxForms);
  });

  it("priceThb 0 แสดงเป็นฟรี", () => {
    const p = effectivePlans({ pro: { priceThb: 0 } });
    expect(p.pro.priceLabel).toBe("฿0 / เดือน");
  });
});

import { normalizeCatalog, toStored, planFeatures, getPlan, catalogRecord, cleanPlan, blankPlan, DEFAULT_PLANS } from "./plans";

describe("plan catalog v2", () => {
  it("รองรับแพ็กเกจที่สร้างเพิ่ม + เรียงตาม sort + เติมแพ็กเกจตั้งต้นที่หาย", () => {
    const list = normalizeCatalog({ v: 2, catalog: [
      { key: "starter", name: "สตาร์ท", priceThb: 490, sort: 15, visible: true, maxForms: 10 },
      { key: "free", sort: 10 },
    ] });
    expect(list.map((p) => p.key)).toEqual(["free", "starter", "pro", "business"]);
    const s = list.find((p) => p.key === "starter")!;
    expect(s.maxForms).toBe(10);
    expect(s.priceLabel).toContain("490");
    expect(s.builtin).toBe(false);
    // ค่าที่ไม่ได้ตั้ง = ค่าของ Pro (blankPlan)
    expect(s.maxMembers).toBe(DEFAULT_PLANS[1].maxMembers);
  });

  it("free แสดงเสมอ · key ไม่ถูกต้อง/ซ้ำถูกตัด", () => {
    const list = normalizeCatalog({ v: 2, catalog: [{ key: "free", visible: false }, { key: "Bad Key" }, { key: "pro", priceThb: 1 }, { key: "pro", priceThb: 2 }] });
    expect(list.find((p) => p.key === "free")!.visible).toBe(true);
    expect(list.some((p) => p.key === "Bad Key")).toBe(false);
    expect(list.find((p) => p.key === "pro")!.priceThb).toBe(1);
  });

  it("toStored → normalize ได้ค่าเดิม", () => {
    const a = normalizeCatalog({ v: 2, catalog: [{ key: "ent", name: "Enterprise", visible: false, notify: true, extras: ["SLA"], sort: 40 }] });
    const b = normalizeCatalog(toStored(a));
    expect(b).toEqual(a);
  });

  it("key ที่ถูกลบ = free", () => {
    const rec = catalogRecord(normalizeCatalog({}));
    expect(getPlan("gone", rec).key).toBe("free");
  });

  it("ลิมิตตัวเลขถูกบีบ ≥0 และไม่เกิน UNLIMITED", () => {
    const p = cleanPlan({ maxWebhooks: -1, storageMb: 1e12, workflow: "yes" }, blankPlan("x"));
    expect(p.maxWebhooks).toBe(blankPlan("x").maxWebhooks);
    expect(p.storageMb).toBe(UNLIMITED);
    expect(p.workflow).toBe(blankPlan("x").workflow);
  });

  it("planFeatures: ฟีเจอร์ที่ไม่มีถูกทำเครื่องหมาย off · extras ต่อท้าย", () => {
    const free = planFeatures({ ...DEFAULT_PLANS[0], extras: ["ซัพพอร์ตทางอีเมล"] }, false);
    expect(free.find((f) => f.text.includes("Webhook"))!.off).toBe(true);
    expect(free.at(-1)!.text).toBe("ซัพพอร์ตทางอีเมล");
    const pro = planFeatures(DEFAULT_PLANS[1], true);
    expect(pro.find((f) => f.text.includes("webhook"))!.off).toBeFalsy();
  });
});
