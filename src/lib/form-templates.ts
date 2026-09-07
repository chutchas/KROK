import type { FormSchema, FormStep } from "@/lib/form-schema";

// คลังเทมเพลตฟอร์มสำเร็จรูป (built-in) — โรงงาน/คลังสินค้าไทย
// ผู้ใช้ "ใช้เทมเพลตนี้" → สร้างเป็นฟอร์มใหม่ในองค์กร แล้วปรับแต่งต่อได้
// display (ชื่อ/ไอคอน/หมวด/จำนวนฟิลด์) ดึงจาก schema โดยตรง
//
// step id + flow เว้นไว้ — sanitizeSchema (ตอน saveForm) จะกำหนดให้เอง

export type TemplateSchema = Omit<FormSchema, "steps" | "flow"> & {
  steps: Omit<FormStep, "id">[];
};

export interface FormTemplate {
  id: string; // slug ของเทมเพลต
  schema: TemplateSchema;
}

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    id: "machine-preshift",
    schema: {
      title: "ตรวจเช็คเครื่องจักรก่อนเริ่มกะ",
      description: "เช็คสภาพเครื่องจักรก่อนเดินเครื่อง ลดเหตุขัดข้องระหว่างกะ",
      icon: "🔧",
      category: "maintenance",
      steps: [
        {
          title: "ข้อมูลเครื่อง",
          fields: [
            { id: "machine_code", type: "barcode", label: "รหัสเครื่องจักร", required: true, width: "half" },
            { id: "shift", type: "select", label: "กะ", required: true, options: ["เช้า", "บ่าย", "ดึก"], width: "half" },
            { id: "checked_at", type: "datetime", label: "วันที่/เวลาตรวจ", required: true },
          ],
        },
        {
          title: "รายการตรวจ",
          fields: [
            { id: "oil_temp", type: "number", label: "อุณหภูมิน้ำมันเครื่อง", required: true, min: 0, max: 150, unit: "°C", width: "half" },
            { id: "oil_level", type: "pass_fail", label: "ระดับน้ำมันหล่อลื่น", required: true, on_fail_require_note: true, width: "half" },
            { id: "belt", type: "pass_fail", label: "สายพาน/โซ่ ไม่หย่อน-ชำรุด", required: true, on_fail_require_note: true, width: "half" },
            { id: "noise", type: "pass_fail", label: "ไม่มีเสียงผิดปกติ", required: true, on_fail_require_note: true, width: "half" },
            { id: "guard", type: "pass_fail", label: "การ์ดกันอันตรายครบ", required: true, on_fail_require_note: true, width: "half" },
            { id: "emergency", type: "pass_fail", label: "ปุ่มหยุดฉุกเฉินใช้งานได้", required: true, on_fail_require_note: true, width: "half" },
            { id: "photo", type: "photo", label: "รูปหน้าเครื่อง/จุดผิดปกติ", required: false, photo_hint: "เห็นเลขเครื่องและจุดที่ตรวจ" },
          ],
        },
        {
          title: "ยืนยัน",
          fields: [
            { id: "note", type: "text", label: "หมายเหตุ/สิ่งที่ต้องแจ้งซ่อม", required: false },
            { id: "sign", type: "signature", label: "ลายเซ็นผู้ตรวจ", required: true },
          ],
        },
      ],
    },
  },
  {
    id: "daily-safety",
    schema: {
      title: "เช็คลิสต์ความปลอดภัยประจำวัน (จป.)",
      description: "ตรวจความปลอดภัยพื้นที่ทำงานประจำวัน ตามหลัก จป.",
      icon: "🦺",
      category: "safety",
      steps: [
        {
          title: "พื้นที่",
          fields: [
            { id: "area", type: "select", label: "พื้นที่/แผนก", required: true, options: ["สายการผลิต A", "สายการผลิต B", "คลังสินค้า", "ลานจอด/ขนถ่าย", "สำนักงาน"], width: "half" },
            { id: "checked_at", type: "datetime", label: "วันที่/เวลา", required: true, width: "half" },
          ],
        },
        {
          title: "รายการตรวจ",
          fields: [
            { id: "ppe", type: "pass_fail", label: "พนักงานสวมอุปกรณ์ป้องกัน (PPE) ครบ", required: true, on_fail_require_note: true, width: "half" },
            { id: "extinguisher", type: "pass_fail", label: "ถังดับเพลิงพร้อมใช้/ไม่หมดอายุ", required: true, on_fail_require_note: true, width: "half" },
            { id: "exit", type: "pass_fail", label: "ทางหนีไฟไม่มีสิ่งกีดขวาง", required: true, on_fail_require_note: true, width: "half" },
            { id: "electric", type: "pass_fail", label: "สายไฟ/ปลั๊ก ไม่ชำรุด", required: true, on_fail_require_note: true, width: "half" },
            { id: "housekeeping", type: "pass_fail", label: "พื้นที่สะอาด ไม่มีของวางเกะกะ", required: true, on_fail_require_note: true, width: "half" },
            { id: "chemical", type: "pass_fail", label: "สารเคมีจัดเก็บถูกต้อง มีป้ายเตือน", required: true, on_fail_require_note: true, width: "half" },
            { id: "hazard_photo", type: "photo", label: "รูปจุดเสี่ยง (ถ้ามี)", required: false, photo_hint: "ถ่ายให้เห็นจุดที่เป็นอันตราย" },
          ],
        },
        {
          title: "สรุป",
          fields: [
            { id: "action", type: "text", label: "การแก้ไข/ข้อเสนอแนะ", required: false },
            { id: "sign", type: "signature", label: "ลายเซ็นผู้ตรวจ", required: true },
          ],
        },
      ],
    },
  },
  {
    id: "goods-receipt",
    schema: {
      title: "ใบตรวจรับสินค้าเข้าคลัง",
      description: "ตรวจรับสินค้า/วัตถุดิบเข้าคลัง พร้อมรายการและสภาพสินค้า",
      icon: "📦",
      category: "logistics",
      steps: [
        {
          title: "ข้อมูลการรับ",
          fields: [
            { id: "supplier", type: "text", label: "ผู้ส่ง/ซัพพลายเออร์", required: true, width: "half" },
            { id: "po_no", type: "barcode", label: "เลขที่ PO/ใบส่งของ", required: true, width: "half" },
            { id: "received_at", type: "datetime", label: "วันที่/เวลารับ", required: true },
          ],
        },
        {
          title: "รายการสินค้า",
          fields: [
            {
              id: "items",
              type: "table",
              label: "รายการสินค้าที่รับ",
              required: true,
              min_rows: 3,
              columns: [
                { id: "name", label: "ชื่อสินค้า", type: "text", width: 3 },
                { id: "qty", label: "จำนวน", type: "number", width: 1 },
                { id: "unit", label: "หน่วย", type: "select", options: ["ชิ้น", "กล่อง", "แพ็ค", "กก.", "ลัง"], width: 1 },
                { id: "cond", label: "สภาพ", type: "select", options: ["ปกติ", "ชำรุด", "ขาด"], width: 1 },
              ],
            },
          ],
        },
        {
          title: "ยืนยันการรับ",
          fields: [
            { id: "damaged_photo", type: "photo", label: "รูปสินค้าชำรุด (ถ้ามี)", required: false, photo_hint: "ถ่ายให้เห็นความเสียหายชัด" },
            { id: "note", type: "text", label: "หมายเหตุ", required: false },
            { id: "sign", type: "signature", label: "ลายเซ็นผู้ตรวจรับ", required: true },
          ],
        },
      ],
    },
  },
  {
    id: "material-requisition",
    schema: {
      title: "ใบเบิกวัสดุ/อะไหล่",
      description: "ขอเบิกวัสดุหรืออะไหล่จากคลัง พร้อมรายการและผู้อนุมัติ",
      icon: "📝",
      category: "logistics",
      steps: [
        {
          title: "ผู้ขอเบิก",
          fields: [
            { id: "requester", type: "text", label: "ชื่อผู้ขอเบิก", required: true, width: "half" },
            { id: "dept", type: "select", label: "แผนก", required: true, options: ["ผลิต", "ซ่อมบำรุง", "คลัง", "QC", "ธุรการ"], width: "half" },
            { id: "req_at", type: "datetime", label: "วันที่ขอเบิก", required: true },
          ],
        },
        {
          title: "รายการเบิก",
          fields: [
            {
              id: "items",
              type: "table",
              label: "รายการที่ขอเบิก",
              required: true,
              min_rows: 3,
              columns: [
                { id: "code", label: "รหัส", type: "text", width: 1 },
                { id: "name", label: "รายการ", type: "text", width: 3 },
                { id: "qty", label: "จำนวน", type: "number", width: 1 },
                { id: "unit", label: "หน่วย", type: "text", width: 1 },
              ],
            },
            { id: "purpose", type: "text", label: "วัตถุประสงค์การใช้งาน", required: true },
          ],
        },
        {
          title: "อนุมัติ",
          fields: [
            { id: "requester_sign", type: "signature", label: "ลายเซ็นผู้ขอเบิก", required: true, width: "half" },
            { id: "approver_sign", type: "signature", label: "ลายเซ็นผู้อนุมัติ", required: true, width: "half" },
          ],
        },
      ],
    },
  },
  {
    id: "qc-inspection",
    schema: {
      title: "บันทึกตรวจสอบคุณภาพ (QC)",
      description: "ตรวจสอบคุณภาพสินค้ารายล็อต บันทึกค่าที่วัดและผลตัดสิน",
      icon: "🔬",
      category: "quality",
      steps: [
        {
          title: "ข้อมูลล็อต",
          fields: [
            { id: "product", type: "text", label: "ชื่อสินค้า/รุ่น", required: true, width: "half" },
            { id: "lot_no", type: "barcode", label: "เลขที่ล็อต", required: true, width: "half" },
            { id: "sample_size", type: "number", label: "จำนวนที่สุ่มตรวจ", required: true, min: 1, unit: "ชิ้น", width: "half" },
            { id: "inspected_at", type: "datetime", label: "วันที่/เวลาตรวจ", required: true, width: "half" },
          ],
        },
        {
          title: "ผลการวัด",
          fields: [
            {
              id: "measurements",
              type: "table",
              label: "ค่าที่วัดได้",
              required: true,
              min_rows: 3,
              columns: [
                { id: "item", label: "รายการวัด", type: "text", width: 2 },
                { id: "spec", label: "สเปก", type: "text", width: 1 },
                { id: "actual", label: "ค่าที่วัดได้", type: "text", width: 1 },
                { id: "result", label: "ผล", type: "select", options: ["ผ่าน", "ไม่ผ่าน"], width: 1 },
              ],
            },
            { id: "overall", type: "pass_fail", label: "สรุปผลรวมของล็อต", required: true, on_fail_require_note: true },
            { id: "defect_photo", type: "photo", label: "รูปของเสีย (ถ้ามี)", required: false, photo_hint: "ถ่ายจุดบกพร่องให้ชัด" },
          ],
        },
        {
          title: "ยืนยัน",
          fields: [
            { id: "sign", type: "signature", label: "ลายเซ็นผู้ตรวจ (QC)", required: true },
          ],
        },
      ],
    },
  },
  {
    id: "five-s",
    schema: {
      title: "เช็คลิสต์ 5ส ประจำพื้นที่",
      description: "ตรวจประเมิน 5ส (สะสาง สะดวก สะอาด สุขลักษณะ สร้างนิสัย) รายพื้นที่",
      icon: "✨",
      category: "audit",
      steps: [
        {
          title: "พื้นที่ประเมิน",
          fields: [
            { id: "area", type: "select", label: "พื้นที่", required: true, options: ["สายการผลิต", "คลังสินค้า", "ห้องเครื่องมือ", "สำนักงาน", "โรงอาหาร"], width: "half" },
            { id: "assessed_at", type: "datetime", label: "วันที่ประเมิน", required: true, width: "half" },
          ],
        },
        {
          title: "หัวข้อ 5ส",
          fields: [
            { id: "s1", type: "pass_fail", label: "สะสาง — ไม่มีของไม่จำเป็นในพื้นที่", required: true, on_fail_require_note: true, width: "half" },
            { id: "s2", type: "pass_fail", label: "สะดวก — ของมีที่วางชัดเจน หยิบง่าย", required: true, on_fail_require_note: true, width: "half" },
            { id: "s3", type: "pass_fail", label: "สะอาด — พื้น/เครื่องมือสะอาด", required: true, on_fail_require_note: true, width: "half" },
            { id: "s4", type: "pass_fail", label: "สุขลักษณะ — มีมาตรฐานและป้ายกำกับ", required: true, on_fail_require_note: true, width: "half" },
            { id: "s5", type: "pass_fail", label: "สร้างนิสัย — ปฏิบัติต่อเนื่องสม่ำเสมอ", required: true, on_fail_require_note: true, width: "half" },
            { id: "score", type: "number", label: "คะแนนรวม", required: false, min: 0, max: 100, unit: "คะแนน", width: "half" },
          ],
        },
        {
          title: "หลักฐาน",
          fields: [
            { id: "photo", type: "photo", label: "รูปพื้นที่", required: false, photo_hint: "ถ่ายภาพรวมของพื้นที่" },
            { id: "sign", type: "signature", label: "ลายเซ็นผู้ประเมิน", required: true },
          ],
        },
      ],
    },
  },
  {
    id: "machine-cleaning",
    schema: {
      title: "บันทึกการทำความสะอาดเครื่องจักร",
      description: "บันทึกการทำความสะอาดเครื่องจักรตามแผน พร้อมสารเคมีที่ใช้",
      icon: "🧽",
      category: "maintenance",
      steps: [
        {
          title: "ข้อมูลเครื่อง",
          fields: [
            { id: "machine_code", type: "barcode", label: "รหัสเครื่องจักร", required: true, width: "half" },
            { id: "cleaned_at", type: "datetime", label: "วันที่/เวลา", required: true, width: "half" },
          ],
        },
        {
          title: "รายการทำความสะอาด",
          fields: [
            { id: "power_off", type: "pass_fail", label: "ตัดไฟ/ล็อกเครื่องก่อนทำความสะอาด", required: true, on_fail_require_note: true, width: "half" },
            { id: "surface", type: "pass_fail", label: "ทำความสะอาดพื้นผิว/ฝาครอบ", required: true, width: "half" },
            { id: "residue", type: "pass_fail", label: "กำจัดเศษวัสดุ/คราบสกปรก", required: true, width: "half" },
            { id: "lubricate", type: "pass_fail", label: "หล่อลื่นจุดที่กำหนด", required: true, width: "half" },
            {
              id: "chemicals",
              type: "table",
              label: "สารเคมี/อุปกรณ์ที่ใช้",
              required: false,
              min_rows: 2,
              columns: [
                { id: "name", label: "ชื่อสารเคมี/อุปกรณ์", type: "text", width: 3 },
                { id: "qty", label: "ปริมาณ", type: "text", width: 1 },
              ],
            },
            { id: "photo", type: "photo", label: "รูปหลังทำความสะอาด", required: false, photo_hint: "ถ่ายให้เห็นความสะอาดของเครื่อง" },
          ],
        },
        {
          title: "ยืนยัน",
          fields: [
            { id: "sign", type: "signature", label: "ลายเซ็นผู้ปฏิบัติงาน", required: true },
          ],
        },
      ],
    },
  },
  {
    id: "incident-report",
    schema: {
      title: "ใบรายงานอุบัติการณ์/เหตุผิดปกติ",
      description: "รายงานอุบัติเหตุหรือเหตุการณ์ผิดปกติ พร้อมการแก้ไขเบื้องต้น",
      icon: "🚨",
      category: "safety",
      steps: [
        {
          title: "ข้อมูลเหตุการณ์",
          fields: [
            { id: "occurred_at", type: "datetime", label: "วันที่/เวลาเกิดเหตุ", required: true, width: "half" },
            { id: "location", type: "select", label: "สถานที่", required: true, options: ["สายการผลิต", "คลังสินค้า", "ลานขนถ่าย", "สำนักงาน", "อื่นๆ"], width: "half" },
            { id: "severity", type: "select", label: "ระดับความรุนแรง", required: true, options: ["เล็กน้อย", "ปานกลาง", "รุนแรง", "ฉุกเฉิน"] },
          ],
        },
        {
          title: "รายละเอียด",
          fields: [
            { id: "description", type: "text", label: "รายละเอียดเหตุการณ์", required: true },
            { id: "photo", type: "photo", label: "รูปที่เกิดเหตุ", required: false, photo_hint: "ถ่ายให้เห็นสภาพจุดเกิดเหตุ" },
            { id: "action", type: "text", label: "การแก้ไขเบื้องต้นที่ทำไปแล้ว", required: true },
            { id: "injured", type: "pass_fail", label: "มีผู้ได้รับบาดเจ็บหรือไม่ (ผ่าน = ไม่มี)", required: true, on_fail_require_note: true },
          ],
        },
        {
          title: "ผู้รายงาน",
          fields: [
            { id: "reporter", type: "text", label: "ชื่อผู้รายงาน", required: true, width: "half" },
            { id: "sign", type: "signature", label: "ลายเซ็น", required: true, width: "half" },
          ],
        },
      ],
    },
  },
];

export function getTemplate(id: string): FormTemplate | undefined {
  return FORM_TEMPLATES.find((tpl) => tpl.id === id);
}
