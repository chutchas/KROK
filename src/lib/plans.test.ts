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
