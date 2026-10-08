import { describe, it, expect } from "vitest";
import {
  buildEvidence,
  filterQueue,
  formOptions,
  areaOptions,
  summarizeBulk,
  capIds,
  mapLimit,
  isRejectReasonValid,
  EMPTY_FILTER,
  MAX_THUMBS,
} from "../approval-queue";

describe("isRejectReasonValid", () => {
  it("ต้องมีอย่างน้อย 3 ตัวหลังตัดช่องว่าง", () => {
    expect(isRejectReasonValid("")).toBe(false);
    expect(isRejectReasonValid("   ab  ")).toBe(false);
    expect(isRejectReasonValid(" abc ")).toBe(true);
    expect(isRejectReasonValid(null)).toBe(false);
  });
});

describe("buildEvidence", () => {
  const photo = { label: "รูปจุดรั่ว", type: "photo", photoField: "p1", photoFields: ["p1", "p1.ph.slot01"], photoLabels: ["หน้า", ""] };
  it("ใบที่ไม่มีข้อไม่ผ่าน → ไม่มีรูปให้ขอ URL", () => {
    const ev = buildEvidence([photo, { label: "ความดัน", type: "number", display: "5" }]);
    expect(ev).toEqual({ failed: [], photos: [], photoTotal: 0 });
  });
  it("ข้อไม่ผ่าน + หมายเหตุ + รูปของฟิลด์รูป", () => {
    const ev = buildEvidence([{ label: "วาล์ว", type: "pass_fail", display: "ไม่ผ่าน", note: "รั่วซึม", fail: true }, photo]);
    expect(ev.failed).toEqual([{ label: "วาล์ว", display: "ไม่ผ่าน", note: "รั่วซึม" }]);
    expect(ev.photos).toEqual([
      { key: "p1", label: "รูปจุดรั่ว — หน้า" },
      { key: "p1.ph.slot01", label: "รูปจุดรั่ว (2/2)" },
    ]);
    expect(ev.photoTotal).toBe(2);
  });
  it("ตาราง: บอกแถวที่ไม่ผ่าน และรูปในแถวนั้นมาก่อน", () => {
    const ev = buildEvidence([
      photo,
      {
        label: "ตรวจยาง", type: "table", fail: true,
        columns: [{ id: "c1", label: "สภาพ", type: "pass_fail" }, { id: "c2", label: "รูป", type: "photo" }],
        rows: [{ c1: "pass", c2: "t1.c2.aaaaaaaa" }, { c1: "fail", c2: "t1.c2.bbbbbbbb" }],
      },
    ]);
    expect(ev.failed[0].details).toEqual(["แถว 2: สภาพ"]);
    expect(ev.photos[0]).toEqual({ key: "t1.c2.bbbbbbbb", label: "ตรวจยาง แถว 2" });
    expect(ev.photos).toHaveLength(3);
  });
  it("จำกัดจำนวนรูปย่อ แต่บอกจำนวนทั้งหมด", () => {
    const many = { label: "รูป", type: "photo", photoFields: Array.from({ length: 10 }, (_, i) => `p.ph.slot${String(i).padStart(2, "0")}`) };
    const ev = buildEvidence([{ label: "x", type: "pass_fail", fail: true }, many]);
    expect(ev.photos).toHaveLength(MAX_THUMBS);
    expect(ev.photoTotal).toBe(10);
  });
});

describe("filterQueue", () => {
  const items = [
    { id: "1", form_id: "f1", form_title: "ตรวจรถโฟล์คลิฟท์", user_name: "สมชาย", fails: ["a"], area: { id: "A", name: "โซน 1" } },
    { id: "2", form_id: "f2", form_title: "ตรวจถังดับเพลิง", user_name: "Somsri", fails: [] },
    { id: "3", form_id: "f1", form_title: "ตรวจรถโฟล์คลิฟท์", user_name: "วิชัย", fails: [], area: { id: "B", name: "โซน 2" } },
    { id: "4", form_id: null, form_title: "ฟอร์มเก่า", user_name: null, fails: null },
  ];
  const ids = (f: Partial<typeof EMPTY_FILTER>) => filterQueue(items, { ...EMPTY_FILTER, ...f }).map((x) => x.id);
  it("ไม่มีตัวกรอง = ทั้งหมด", () => expect(ids({})).toEqual(["1", "2", "3", "4"]));
  it("ตามฟอร์ม (ฟอร์มไม่มี id ใช้ชื่อ)", () => {
    expect(ids({ form: "f1" })).toEqual(["1", "3"]);
    expect(ids({ form: "t:ฟอร์มเก่า" })).toEqual(["4"]);
  });
  it("ตามผล", () => {
    expect(ids({ result: "fail" })).toEqual(["1"]);
    expect(ids({ result: "pass" })).toEqual(["2", "3", "4"]);
  });
  it("ตามพื้นที่", () => expect(ids({ area: "B" })).toEqual(["3"]));
  it("ค้นหาชื่อฟอร์ม/ผู้ส่ง ไม่สนตัวพิมพ์", () => {
    expect(ids({ q: "somsri" })).toEqual(["2"]);
    expect(ids({ q: " ถังดับ " })).toEqual(["2"]);
    expect(ids({ q: "สม", result: "fail" })).toEqual(["1"]);
  });
  it("ตัวเลือกฟอร์ม/พื้นที่ พร้อมจำนวน", () => {
    expect(formOptions(items).find((o) => o.value === "f1")?.count).toBe(2);
    expect(areaOptions(items).map((o) => o.value)).toEqual(["A", "B"]);
    expect(areaOptions([items[1]])).toEqual([]);
  });
});

describe("bulk", () => {
  it("summarizeBulk นับสำเร็จ/เลื่อนขั้น/ไม่สำเร็จ", () => {
    expect(
      summarizeBulk([
        { id: "a", ok: true },
        { id: "b", ok: true, advanced: true },
        { id: "c", ok: false, error: "ไม่ใช่คิวคุณ" },
      ])
    ).toEqual({ ok: 2, advanced: 1, failed: [{ id: "c", error: "ไม่ใช่คิวคุณ" }] });
  });
  it("capIds ตัดซ้ำ/ค่าเสีย และจำกัดจำนวน", () => {
    expect(capIds(["a", "a", "", 3, "b", null, "c"], 2)).toEqual(["a", "b"]);
  });
  it("mapLimit คงลำดับ และไม่เกิน limit พร้อมกัน", async () => {
    let live = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 3, 2, 4], 2, async (x) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, x));
      live--;
      return x * 10;
    });
    expect(out).toEqual([50, 10, 30, 20, 40]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(await mapLimit([], 3, async (x) => x)).toEqual([]);
  });
});
