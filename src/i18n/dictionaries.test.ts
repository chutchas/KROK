import { describe, it, expect } from "vitest";
import { th } from "./th";
import { en } from "./en";
const DICT = { th, en } as const;

describe("dictionaries TH/EN parity", () => {
  it("ชุด key ของ th และ en ต้องตรงกัน (กันคำแปลตกหล่น)", () => {
    const th = Object.keys(DICT.th).sort();
    const en = Object.keys(DICT.en).sort();
    const missingInEn = th.filter((k) => !(k in DICT.en));
    const missingInTh = en.filter((k) => !(k in DICT.th));
    expect(missingInEn, `ขาดใน EN: ${missingInEn.join(", ")}`).toEqual([]);
    expect(missingInTh, `ขาดใน TH: ${missingInTh.join(", ")}`).toEqual([]);
    expect(th.length).toBe(en.length);
  });

  it("ทุกค่าต้องไม่ว่าง", () => {
    for (const [k, v] of Object.entries(DICT.th)) expect(v, `th.${k} ว่าง`).toBeTruthy();
    for (const [k, v] of Object.entries(DICT.en)) expect(v, `en.${k} ว่าง`).toBeTruthy();
  });
});

describe("landing dictionaries TH/EN parity", async () => {
  const { lpTh } = await import("./landing.th");
  const { lpEn } = await import("./landing.en");
  it("key หน้าแรกตรงกันและไม่ว่าง", () => {
    expect(Object.keys(lpEn).sort()).toEqual(Object.keys(lpTh).sort());
    for (const [k, v] of Object.entries(lpTh)) expect(v, `lp th ${k}`).toBeTruthy();
    for (const [k, v] of Object.entries(lpEn)) expect(v, `lp en ${k}`).toBeTruthy();
  });
  it("ไม่มี key lp.* ค้างในพจนานุกรมหลัก", async () => {
    const { th } = await import("./th");
    expect(Object.keys(th).filter((k) => k.startsWith("lp."))).toEqual([]);
  });
});

describe("per-page dictionaries TH/EN parity", async () => {
  const mods = await Promise.all([import("./ns/ds"), import("./ns/notify"), import("./ns/admin"), import("./ns/pay"), import("./ns/area")]);
  const { th: mainTh } = await import("./th");
  it("ทุกชุดมี key ตรงกัน ไม่ว่าง และไม่ซ้ำกับพจนานุกรมหลัก", () => {
    for (const m of mods) {
      const d = Object.values(m).find((v) => v && typeof v === "object" && "th" in (v as object)) as { th: Record<string, string>; en: Record<string, string> };
      expect(Object.keys(d.en).sort()).toEqual(Object.keys(d.th).sort());
      for (const [k, v] of Object.entries(d.th)) { expect(v, k).toBeTruthy(); expect(k in mainTh, `${k} ซ้ำในพจนานุกรมหลัก`).toBe(false); }
      for (const v of Object.values(d.en)) expect(v).toBeTruthy();
    }
  });
});
