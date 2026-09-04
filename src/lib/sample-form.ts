import type { FormSchema } from "./form-schema";

export const SAMPLE_FORM: FormSchema = {
  title: "ใบตรวจ Forklift ประจำวัน",
  icon: "🚜",
  description: "ตรวจสภาพรถยกก่อนเริ่มกะ ทุกวัน ทุกคัน",
  flow: "sequential",
  steps: [
    {
      id: "s1",
      title: "ระบุรถและผู้ตรวจ",
      fields: [
        {
          id: "truck_no",
          type: "barcode",
          label: "สแกน QR ประจำรถ",
          required: true,
          tooltip: "QR ติดอยู่ที่เสา B ด้านขวาของรถ ถ้าสแกนไม่ได้ให้พิมพ์รหัสรถ เช่น FL-03",
        },
        {
          id: "hour_meter",
          type: "number",
          label: "เลขชั่วโมงเครื่อง (hour meter)",
          required: true,
          min: 0,
          max: 99999,
          unit: "ชม.",
          tooltip: "อ่านจากหน้าปัดตรงกลาง จดเลขก่อนสตาร์ท",
          example: "12480",
        },
      ],
    },
    {
      id: "s2",
      title: "ตรวจสภาพก่อนใช้งาน",
      fields: [
        {
          id: "fork_ok",
          type: "pass_fail",
          label: "งาไม่คด ไม่ร้าว สลักล็อคครบ",
          required: true,
          on_fail_require_note: true,
          tooltip: "มองตามแนวงาทั้งสองข้าง เช็ครอยร้าวบริเวณส้นงาเป็นพิเศษ",
        },
        {
          id: "brake_ok",
          type: "pass_fail",
          label: "เบรกทำงานปกติ",
          required: true,
          on_fail_require_note: true,
          tooltip: "เคลื่อนรถช้าๆ 2-3 เมตรแล้วทดสอบเบรก ต้องหยุดนิ่งไม่ไหล",
        },
        {
          id: "tire_photo",
          type: "photo",
          label: "ถ่ายรูปยางหน้าซ้าย",
          required: true,
          photo_hint: "เห็นดอกยางและแก้มยางชัดเจน ถ่ายห่างไม่เกิน 1 เมตร",
          tooltip: "ย่อตัวให้กล้องระดับเดียวกับยาง อย่าถ่ายย้อนแสง",
        },
        {
          id: "horn_light",
          type: "checkbox",
          label: "อุปกรณ์เตือนที่ทำงานปกติ (เลือกทุกข้อที่ผ่าน)",
          required: true,
          options: ["แตร", "ไฟหน้า", "ไฟเลี้ยว", "ไฟถอย + เสียงถอย", "ไฟวับวาบ (beacon)"],
          tooltip: "ทดสอบทีละอย่าง ข้อไหนไม่ทำงานอย่าเพิ่งติ๊ก แล้วแจ้งหัวหน้ากะ",
        },
      ],
    },
    {
      id: "s3",
      title: "ยืนยันผล",
      fields: [
        {
          id: "note",
          type: "text",
          label: "หมายเหตุเพิ่มเติม (ถ้ามี)",
          required: false,
          tooltip: "สิ่งผิดปกติอื่นๆ ที่พบ เช่น เสียงดัง น้ำมันรั่ว",
          example: "มีเสียงดังเบาๆ จากล้อหลังขวาตอนเลี้ยว",
        },
        {
          id: "sign",
          type: "signature",
          label: "ลายเซ็นผู้ตรวจ",
          required: true,
          tooltip: "เซ็นด้วยนิ้วในกรอบ",
        },
      ],
    },
  ],
};

export const CHIP_PROMPTS = [
  "ใบตรวจรับสินค้าเข้าคลัง",
  "ใบตรวจความสะอาด 5ส ประจำสัปดาห์",
  "check-in ผู้รับเหมาเข้าพื้นที่โรงงาน",
  "ใบบันทึกอุณหภูมิห้องเย็นรายชั่วโมง",
  "QC ตรวจชิ้นงานแรก (first piece)",
];
