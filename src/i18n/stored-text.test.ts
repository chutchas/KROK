import { describe, it, expect } from "vitest";
import { localizeStored } from "./stored-text";

describe("localizeStored", () => {
  it("แปลเฉพาะตอนเลือกภาษาอังกฤษ", () => {
    expect(localizeStored("เซ็นแล้ว — สมชาย", "th")).toBe("เซ็นแล้ว — สมชาย");
    expect(localizeStored("เซ็นแล้ว — สมชาย", "en")).toBe("Signed — สมชาย");
    expect(localizeStored("3 รูป", "en")).toBe("3 photos");
    expect(localizeStored("อุณหภูมิ (ค่านอกช่วง)", "en")).toBe("อุณหภูมิ (out of range)");
    expect(localizeStored("ตาราง แถว 2: ความสะอาด", "en")).toBe("ตาราง row 2: ความสะอาด");
    expect(localizeStored(null, "en")).toBe("");
  });
});
