import { describe, it, expect } from "vitest";
import { DICT } from "./dictionaries";

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
