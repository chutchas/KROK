import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildSubmissionPdf } from "@/lib/pdf/submission-pdf";
import { pdfFirstPagePng } from "@/lib/pdf/pdf-thumb";

describe("pdfFirstPagePng", () => {
  it("วาดหน้าแรกของ PDF ภาษาไทยเป็น PNG ขนาดเล็ก", async () => {
    const pdf = await buildSubmissionPdf({
      tenantName: "บริษัท ทดสอบ จำกัด", formTitle: "ตรวจเช็ครถโฟล์คลิฟท์ประจำวัน", docNo: "FL-6910-0042", fullId: "x",
      statusLabel: "ไม่ผ่าน 1 ข้อ", statusColor: "fail", resultFail: true, failCount: 1, userName: "สมชาย ใจดี",
      submittedAt: "9 ต.ค. 2569 11:50", durationS: 252, formVersion: 1,
      answers: [
        { label: "ไฟเบรก", type: "pass_fail", display: "ไม่ผ่าน", fail: true, note: "ไฟเบรกซ้ายดับ ต้องเปลี่ยนหลอด" },
        { label: "ระดับน้ำมันไฮดรอลิก", type: "pass_fail", display: "ผ่าน" },
        { label: "ชั่วโมงเครื่อง", type: "number", display: "1,284 ชม." },
      ],
    });
    const t0 = Date.now();
    const png = await pdfFirstPagePng(new Uint8Array(pdf));
    const ms = Date.now() - t0;
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.length).toBeLessThan(120_000);
    if (process.env.THUMB_OUT) (await import("fs")).writeFileSync(process.env.THUMB_OUT, png);
    console.log("thumb bytes", png.length, "ms", ms);
  }, 30_000);
});

describe("PDF ตารางที่มีแถวชำรุด", () => {
  it("วาดได้ (ช่องที่ไม่ผ่านเป็นสีแดง)", async () => {
    const pdf = await buildSubmissionPdf({
      tenantName: "ทดสอบ", formTitle: "รับสินค้า", docNo: "RC-0001", fullId: "x", statusLabel: "ส่งแล้ว", resultFail: true, failCount: 1,
      userName: "สมชาย", submittedAt: "-", durationS: 1, formVersion: 1,
      answers: [{ label: "รายการสินค้า", type: "table", fail: true,
        columns: [{ id: "name", label: "สินค้า", type: "text" }, { id: "cond", label: "สภาพ", type: "select", fail_options: ["ชำรุด"] }, { id: "ok", label: "ตรวจ", type: "pass_fail" }],
        rows: [{ name: "A", cond: "ปกติ", ok: "ผ่าน" }, { name: "B", cond: "ชำรุด", ok: "ไม่ผ่าน" }] }],
    });
    const png = await pdfFirstPagePng(new Uint8Array(pdf));
    if (process.env.THUMB_OUT) (await import("fs")).writeFileSync(process.env.THUMB_OUT.replace(".png", "-table.png"), png);
    expect(png.length).toBeGreaterThan(1000);
  }, 30_000);
});
