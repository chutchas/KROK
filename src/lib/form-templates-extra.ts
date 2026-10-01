// ============================================================
// KROK · เทมเพลตเพิ่มเติม (หลายอุตสาหกรรม) — แยกไฟล์จาก form-templates.ts เพื่อให้อ่านง่าย
// หัวข้อไม่ซ้ำกับตัวอย่างคำสั่ง AI (prompt-library) — มี test กันซ้ำ
// ============================================================
import type { FormField, TableColumn } from "@/lib/form-schema";
import type { FormTemplate } from "@/lib/form-templates";

type Opt = Partial<FormField>;
const txt = (id: string, label: string, o: Opt = {}): FormField => ({ id, type: "text", label, required: true, width: "half", ...o });
const num = (id: string, label: string, unit: string, o: Opt = {}): FormField => ({ id, type: "number", label, unit, required: true, width: "half", ...o });
const sel = (id: string, label: string, options: string[], o: Opt = {}): FormField => ({ id, type: "select", label, options, required: true, width: "half", ...o });
const chk = (id: string, label: string, options: string[], o: Opt = {}): FormField => ({ id, type: "checkbox", label, options, required: false, ...o });
const pf = (id: string, label: string, o: Opt = {}): FormField => ({ id, type: "pass_fail", label, required: true, on_fail_require_note: true, width: "half", ...o });
const photo = (id: string, label: string, hint?: string, o: Opt = {}): FormField => ({ id, type: "photo", label, required: false, ...(hint ? { photo_hint: hint } : {}), ...o });
const scan = (id: string, label: string, o: Opt = {}): FormField => ({ id, type: "barcode", label, required: true, width: "half", ...o });
const when = (id: string, label: string, o: Opt = {}): FormField => ({ id, type: "datetime", label, required: true, width: "half", ...o });
const sign = (id: string, label: string, o: Opt = {}): FormField => ({ id, type: "signature", label, required: true, width: "half", ...o });
const table = (id: string, label: string, columns: TableColumn[], o: Opt = {}): FormField => ({ id, type: "table", label, required: true, min_rows: 3, columns, ...o });
const col = (id: string, label: string, type: TableColumn["type"] = "text", extra: Partial<TableColumn> = {}): TableColumn => ({ id, label, type, width: 1, ...extra });
const SHIFT = ["เช้า", "บ่าย", "ดึก"];

export const EXTRA_TEMPLATES: FormTemplate[] = [
  {
    id: "shift-handover", industries: ["manufacturing", "healthcare", "hospitality", "energy"],
    schema: {
      title: "บันทึกส่งมอบงานระหว่างกะ", icon: "🔁", category: "production",
      description: "ส่งต่องานค้าง ปัญหา และสิ่งที่กะถัดไปต้องรู้ ลดงานตกหล่นระหว่างเปลี่ยนกะ",
      steps: [
        { title: "ข้อมูลกะ", fields: [txt("area", "แผนก/พื้นที่"), sel("from_shift", "กะที่ส่ง", SHIFT), txt("giver", "ผู้ส่งมอบ"), txt("receiver", "ผู้รับมอบ")] },
        { title: "สถานะงาน", fields: [
          table("jobs", "งานที่ยังค้าง", [col("job", "งาน", "text", { width: 3 }), col("status", "สถานะ", "select", { options: ["กำลังทำ", "รออะไหล่", "รออนุมัติ", "ยังไม่เริ่ม"] }), col("note", "หมายเหตุ", "text", { width: 2 })], { min_rows: 2 }),
          txt("issues", "ปัญหา/ความผิดปกติที่ต้องเฝ้าระวัง", { width: "full" }),
          pf("tools", "เครื่องมือ/กุญแจ/วิทยุครบ"),
          pf("area_clean", "พื้นที่สะอาดเรียบร้อย"),
        ] },
        { title: "ยืนยัน", fields: [sign("sign_giver", "ลายเซ็นผู้ส่งมอบ"), sign("sign_receiver", "ลายเซ็นผู้รับมอบ")] },
      ],
    },
  },
  {
    id: "punch-list", industries: ["construction", "facilities"],
    schema: {
      title: "ตรวจรับงานผู้รับเหมา (Punch list)", icon: "🏗️", category: "inspection",
      description: "ตรวจรับงวดงาน/ส่งมอบงานก่อสร้าง บันทึกจุดบกพร่องที่ผู้รับเหมาต้องแก้ไขก่อนรับงาน",
      steps: [
        { title: "ข้อมูลงาน", fields: [txt("project", "โครงการ"), txt("contractor", "ผู้รับเหมา"), txt("scope", "งวดงาน/ขอบเขตที่ตรวจ", { width: "full" }), when("inspected_at", "วันที่ตรวจ")] },
        { title: "จุดบกพร่อง", fields: [
          table("defects", "รายการที่ต้องแก้ไข", [col("loc", "ตำแหน่ง", "text", { width: 2 }), col("defect", "รายละเอียด", "text", { width: 3 }), col("level", "ระดับ", "select", { options: ["ต้องแก้ก่อนรับงาน", "แก้ภายหลังได้"] })]),
          photo("defect_photos", "รูปจุดบกพร่อง", "ถ่ายให้เห็นตำแหน่งและป้ายเลขห้อง/จุด"),
          sel("result", "ผลการตรวจรับ", ["รับงาน", "รับงานแบบมีเงื่อนไข", "ไม่รับงาน ต้องแก้ไข"]),
        ] },
        { title: "ลงนาม", fields: [sign("sign_owner", "ผู้ตรวจรับ (เจ้าของงาน)"), sign("sign_contractor", "ผู้รับเหมา")] },
      ],
    },
  },
  {
    id: "concrete-pour", industries: ["construction"],
    schema: {
      title: "ตรวจก่อนเทคอนกรีต", icon: "🧱", category: "quality",
      description: "เช็กแบบหล่อ เหล็กเสริม และคอนกรีตที่ส่งมาก่อนอนุมัติเท พร้อมบันทึกค่ายุบตัว (slump)",
      steps: [
        { title: "ข้อมูล", fields: [txt("location", "ตำแหน่งที่เท (ชั้น/โซน/ชิ้นส่วน)"), num("volume", "ปริมาณคอนกรีต", "ลบ.ม."), txt("supplier", "ผู้ส่งคอนกรีต"), txt("ticket", "เลขใบส่งคอนกรีต")] },
        { title: "ก่อนเท", fields: [pf("formwork", "แบบหล่อแข็งแรง ไม่รั่ว"), pf("rebar", "เหล็กเสริมตรงตามแบบ ระยะหุ้มถูกต้อง"), pf("embed", "ท่อ/อุปกรณ์ฝังวางครบ"), pf("clean", "ทำความสะอาดแบบหล่อแล้ว")] },
        { title: "คอนกรีต", fields: [
          sel("strength", "กำลังอัดที่สั่ง", ["240 ksc", "280 ksc", "320 ksc", "350 ksc"]),
          num("slump", "ค่ายุบตัว (Slump)", "ซม.", { min: 7.5, max: 12.5 }),
          num("cubes", "จำนวนก้อนตัวอย่างที่เก็บ", "ก้อน"),
          photo("pour_photo", "รูปก่อน/ระหว่างเท"),
          sign("engineer", "ลายเซ็นวิศวกรผู้อนุมัติ"),
        ] },
      ],
    },
  },
  {
    id: "restroom-cleaning", industries: ["facilities", "retail", "hospitality", "healthcare"],
    schema: {
      title: "บันทึกทำความสะอาดห้องน้ำรายชั่วโมง", icon: "🚻", category: "checklist",
      description: "แม่บ้านบันทึกทุกรอบที่ทำความสะอาด สแกน QR หน้าห้องน้ำ ตรวจของใช้สิ้นเปลือง",
      steps: [
        { title: "รอบทำความสะอาด", fields: [scan("restroom", "ห้องน้ำ (สแกน QR หน้าห้อง)"), when("cleaned_at", "เวลาทำความสะอาด"), txt("cleaner", "ผู้ทำความสะอาด")] },
        { title: "รายการ", fields: [
          pf("floor", "พื้นแห้ง สะอาด ไม่มีกลิ่น"), pf("toilet", "โถส้วม/โถปัสสาวะสะอาด"), pf("sink", "อ่างล้างมือและกระจกสะอาด"),
          chk("refill", "เติมของใช้", ["กระดาษชำระ", "สบู่เหลว", "กระดาษเช็ดมือ", "น้ำยาฆ่าเชื้อ"]),
          photo("photo", "รูปหลังทำความสะอาด"),
        ] },
      ],
    },
  },
  {
    id: "vehicle-handover", industries: ["logistics", "general"],
    schema: {
      title: "รับ-คืนรถส่วนกลาง/รถเช่า", icon: "🚗", category: "logistics",
      description: "บันทึกสภาพรถ เลขไมล์ และน้ำมันตอนรับและคืนรถ พร้อมรูปรอบคัน กันข้อโต้แย้งเรื่องความเสียหาย",
      steps: [
        { title: "ข้อมูล", fields: [scan("plate", "ทะเบียนรถ"), sel("action", "รายการ", ["รับรถ", "คืนรถ"]), txt("driver", "ผู้ใช้รถ"), txt("purpose", "วัตถุประสงค์/ปลายทาง")] },
        { title: "สภาพรถ", fields: [
          num("odometer", "เลขไมล์", "กม."), sel("fuel", "ระดับน้ำมัน", ["เต็ม", "3/4", "1/2", "1/4", "ใกล้หมด"]),
          pf("body", "ตัวถังไม่มีรอยใหม่"), pf("interior", "ภายในสะอาด อุปกรณ์ครบ"),
          photo("photos", "รูปรอบคัน 4 ด้าน + หน้าปัด", "หน้า หลัง ซ้าย ขวา และหน้าปัดเลขไมล์", { required: true }),
        ] },
        { title: "ยืนยัน", fields: [sign("sign_driver", "ลายเซ็นผู้ใช้รถ"), sign("sign_admin", "ลายเซ็นผู้ดูแลรถ")] },
      ],
    },
  },
  {
    id: "truck-loading", industries: ["logistics", "manufacturing", "port"],
    schema: {
      title: "ตรวจการโหลดสินค้าขึ้นรถ", icon: "🚚", category: "logistics",
      description: "เช็กรถก่อนโหลด จำนวนสินค้า การจัดเรียง และเลขซีล ก่อนปล่อยรถออกจากคลัง",
      steps: [
        { title: "รถและเอกสาร", fields: [txt("plate", "ทะเบียนรถ"), scan("do_no", "เลขที่ใบส่งสินค้า (DO)"), txt("driver", "พนักงานขับ"), pf("truck_clean", "กระบะ/ตู้สะอาด แห้ง ไม่มีกลิ่น")] },
        { title: "การโหลด", fields: [
          table("load", "รายการที่โหลด", [col("sku", "รหัสสินค้า"), col("qty", "จำนวน", "number"), col("pallets", "พาเลท", "number")]),
          pf("stacking", "จัดเรียงมั่นคง รัดสายแล้ว"), txt("seal", "เลขซีล"),
          photo("load_photo", "รูปสินค้าในรถก่อนปิดประตู", undefined, { required: true }),
        ] },
        { title: "ปล่อยรถ", fields: [when("released_at", "เวลาออก"), sign("sign_checker", "ลายเซ็นผู้ตรวจโหลด"), sign("sign_driver", "ลายเซ็นพนักงานขับ")] },
      ],
    },
  },
  {
    id: "racking-inspection", industries: ["logistics", "manufacturing", "retail"],
    schema: {
      title: "ตรวจชั้นวางสินค้า (Racking)", icon: "🗄️", category: "safety",
      description: "ตรวจความเสียหายของชั้นวางในคลังประจำเดือน ระบุระดับความเสี่ยงแบบไฟจราจร",
      steps: [
        { title: "ข้อมูล", fields: [txt("aisle", "แถว/ช่อง (Aisle/Bay)"), when("inspected_at", "วันที่ตรวจ"), txt("inspector", "ผู้ตรวจ")] },
        { title: "การตรวจ", fields: [
          pf("upright", "เสาตั้งไม่บิด/บุบ"), pf("beam", "คานไม่โก่ง สลักล็อกครบ"), pf("baseplate", "แผ่นฐานและพุกยึดพื้นแน่น"),
          pf("load_sign", "ป้ายพิกัดน้ำหนักติดชัดเจน"), pf("overload", "ไม่วางเกินพิกัด ไม่ยื่นเกินคาน"),
          sel("risk", "ระดับความเสียหาย", ["เขียว — ใช้ได้", "เหลือง — เฝ้าระวัง/ซ่อมภายใน 4 สัปดาห์", "แดง — ห้ามใช้ทันที"]),
          photo("damage", "รูปจุดเสียหาย"),
        ] },
      ],
    },
  },
  {
    id: "calibration", industries: ["manufacturing", "food", "healthcare"],
    schema: {
      title: "บันทึกสอบเทียบเครื่องมือวัด", icon: "📏", category: "quality",
      description: "สอบเทียบภายใน (in-house) เทียบกับเครื่องมือมาตรฐาน บันทึกค่าคลาดเคลื่อนและกำหนดครั้งถัดไป",
      steps: [
        { title: "เครื่องมือ", fields: [scan("tool_id", "รหัสเครื่องมือ"), sel("tool_type", "ประเภท", ["เวอร์เนีย", "ไมโครมิเตอร์", "เครื่องชั่ง", "เทอร์โมมิเตอร์", "เกจวัดแรงดัน"]), txt("standard", "เครื่องมือมาตรฐานที่ใช้อ้างอิง")] },
        { title: "ผลการสอบเทียบ", fields: [
          table("points", "จุดสอบเทียบ", [col("nominal", "ค่ามาตรฐาน", "number"), col("reading", "ค่าที่อ่านได้", "number"), col("error", "คลาดเคลื่อน", "number")]),
          num("tolerance", "เกณฑ์ยอมรับ (±)", "หน่วยตามเครื่องมือ"),
          pf("result", "ผลอยู่ในเกณฑ์"), when("next_due", "กำหนดสอบเทียบครั้งถัดไป"),
          sign("sign", "ลายเซ็นผู้สอบเทียบ"),
        ] },
      ],
    },
  },
  {
    id: "returns-inspection", industries: ["retail", "logistics"],
    schema: {
      title: "ตรวจรับสินค้าคืน (Returns)", icon: "↩️", category: "logistics",
      description: "ตรวจสภาพสินค้าที่ลูกค้าส่งคืน ตัดสินว่าขายต่อ ซ่อม หรือทำลาย พร้อมรูปหลักฐาน",
      steps: [
        { title: "ข้อมูลการคืน", fields: [scan("order_no", "เลขที่คำสั่งซื้อ/ใบคืน"), txt("customer", "ลูกค้า"), sel("reason", "เหตุผลที่คืน", ["ชำรุด", "ส่งผิดรุ่น", "ไม่ตรงปก", "เปลี่ยนใจ", "อื่นๆ"])] },
        { title: "ตรวจสภาพ", fields: [
          txt("sku", "รหัสสินค้า"), num("qty", "จำนวน", "ชิ้น"), pf("package", "กล่อง/ซีลสมบูรณ์"), pf("accessories", "อุปกรณ์ครบ"),
          photo("photos", "รูปสินค้าและกล่อง", undefined, { required: true }),
          sel("decision", "การจัดการ", ["คืนสต็อกขายได้", "ส่งซ่อม", "ส่งคืนผู้ผลิต", "ทำลาย"]),
        ] },
      ],
    },
  },
  {
    id: "fit-for-work", industries: ["logistics", "construction", "energy", "port"],
    schema: {
      title: "ตรวจความพร้อมก่อนเริ่มงาน (เป่าแอลกอฮอล์)", icon: "🧑‍✈️", category: "safety",
      description: "ตรวจพนักงานขับ/คนงานก่อนเริ่มงาน: ค่าแอลกอฮอล์ การพักผ่อน และความพร้อมของร่างกาย",
      steps: [
        { title: "พนักงาน", fields: [txt("name", "ชื่อพนักงาน"), scan("emp_id", "รหัสพนักงาน"), when("checked_at", "เวลาตรวจ")] },
        { title: "การตรวจ", fields: [
          num("alcohol", "ค่าแอลกอฮอล์", "mg%", { min: 0, max: 0 }),
          num("sleep", "ชั่วโมงนอนเมื่อคืน", "ชม.", { min: 6 }),
          pf("ready", "ร่างกายพร้อม ไม่ง่วง ไม่ได้ทานยาที่ทำให้ง่วง"),
          pf("ppe", "แต่งกาย/PPE พร้อม"),
          sel("decision", "ผล", ["อนุญาตเริ่มงาน", "ไม่อนุญาต — เปลี่ยนคน"]),
          sign("sign_checker", "ลายเซ็นผู้ตรวจ"),
        ] },
      ],
    },
  },
  {
    id: "leave-request", industries: ["general"],
    schema: {
      title: "ใบขอลางาน", icon: "🗓️", category: "hr",
      description: "พนักงานยื่นขอลา ระบุประเภท ช่วงวัน และผู้รับงานแทน แล้วส่งหัวหน้าอนุมัติ",
      steps: [
        { title: "ข้อมูลการลา", fields: [
          txt("name", "ชื่อพนักงาน"), txt("dept", "แผนก"),
          sel("type", "ประเภทการลา", ["ลาพักร้อน", "ลากิจ", "ลาป่วย", "ลาคลอด", "อื่นๆ"]),
          when("from", "ตั้งแต่"), when("to", "ถึง"), num("days", "รวม", "วัน"),
          txt("reason", "เหตุผล", { width: "full" }), txt("backup", "ผู้รับงานแทน", { required: false }),
        ] },
        { title: "ยืนยัน", fields: [photo("doc", "เอกสารแนบ (เช่น ใบรับรองแพทย์)"), sign("sign", "ลายเซ็นผู้ขอลา")] },
      ],
    },
  },
  {
    id: "probation-eval", industries: ["general"],
    schema: {
      title: "แบบประเมินพนักงานทดลองงาน", icon: "📝", category: "hr",
      description: "หัวหน้าประเมินพนักงานก่อนครบทดลองงาน ให้คะแนนรายหัวข้อและสรุปผลบรรจุ",
      steps: [
        { title: "ข้อมูลพนักงาน", fields: [txt("name", "ชื่อพนักงาน"), txt("position", "ตำแหน่ง"), when("start", "วันเริ่มงาน"), txt("evaluator", "ผู้ประเมิน")] },
        { title: "ผลการประเมิน", fields: [
          ...["ความรู้ในงาน", "คุณภาพงาน", "ความตรงต่อเวลา", "การทำงานเป็นทีม", "ความรับผิดชอบ"].map((l, i) => sel(`s${i + 1}`, l, ["5 ดีมาก", "4 ดี", "3 พอใช้", "2 ควรปรับปรุง", "1 ไม่ผ่าน"])),
          txt("strength", "จุดเด่น", { width: "full", required: false }), txt("improve", "สิ่งที่ควรพัฒนา", { width: "full", required: false }),
        ] },
        { title: "สรุป", fields: [sel("decision", "ผลสรุป", ["บรรจุเป็นพนักงาน", "ขยายเวลาทดลองงาน", "ไม่ผ่านทดลองงาน"]), sign("sign", "ลายเซ็นผู้ประเมิน")] },
      ],
    },
  },
  {
    id: "purchase-request", industries: ["general", "manufacturing"],
    schema: {
      title: "ใบขอซื้อ (PR)", icon: "🛒", category: "other",
      description: "ขอซื้อสินค้า/บริการ ระบุรายการ งบประมาณ และผู้ขายที่เสนอ ส่งต่อให้ผู้อนุมัติ",
      steps: [
        { title: "ผู้ขอซื้อ", fields: [txt("name", "ผู้ขอซื้อ"), txt("dept", "แผนก"), when("need_by", "ต้องการภายในวันที่"), sel("priority", "ความเร่งด่วน", ["ปกติ", "ด่วน", "ด่วนมาก"])] },
        { title: "รายการ", fields: [
          table("items", "รายการขอซื้อ", [col("item", "รายการ", "text", { width: 3 }), col("qty", "จำนวน", "number"), col("price", "ราคาต่อหน่วย", "number"), col("vendor", "ผู้ขายที่เสนอ", "text", { width: 2 })]),
          num("total", "รวมงบประมาณ", "บาท"), txt("reason", "เหตุผลการขอซื้อ", { width: "full" }),
          photo("quote", "ใบเสนอราคา"),
        ] },
        { title: "ยืนยัน", fields: [sign("sign", "ลายเซ็นผู้ขอซื้อ")] },
      ],
    },
  },
  {
    id: "sales-visit", industries: ["general", "retail"],
    schema: {
      title: "รายงานเข้าพบลูกค้า", icon: "🤝", category: "other",
      description: "พนักงานขายบันทึกการเข้าพบลูกค้า สิ่งที่คุย โอกาสการขาย และนัดหมายครั้งถัดไป",
      steps: [
        { title: "การเข้าพบ", fields: [txt("customer", "ลูกค้า/บริษัท"), txt("contact", "ผู้ที่เข้าพบ"), when("visited_at", "วันเวลาเข้าพบ"), sel("type", "ประเภท", ["ลูกค้าใหม่", "ลูกค้าเดิม", "ติดตามงาน", "แก้ปัญหา"])] },
        { title: "ผลการเข้าพบ", fields: [
          txt("summary", "สรุปสิ่งที่คุย", { width: "full" }),
          num("value", "มูลค่าโอกาสการขาย", "บาท", { required: false }),
          sel("stage", "สถานะ", ["สนใจ", "ขอใบเสนอราคา", "ต่อรอง", "ปิดการขาย", "ไม่สนใจ"]),
          when("next", "นัดครั้งถัดไป", { required: false }),
          photo("photo", "รูปหน้าร้าน/นามบัตร"),
        ] },
      ],
    },
  },
  {
    id: "cash-count", industries: ["retail", "hospitality", "food"],
    schema: {
      title: "นับเงินสดปิดกะ", icon: "💵", category: "audit",
      description: "นับเงินในลิ้นชักตอนปิดกะ เทียบกับยอดขายในระบบ บันทึกส่วนต่างและผู้ตรวจนับ",
      steps: [
        { title: "ข้อมูล", fields: [txt("branch", "สาขา"), txt("pos", "เครื่อง POS"), sel("shift", "กะ", SHIFT), txt("cashier", "แคชเชียร์")] },
        { title: "การนับ", fields: [
          table("notes", "จำนวนธนบัตร/เหรียญ", [col("denom", "ชนิด", "select", { options: ["1000", "500", "100", "50", "20", "เหรียญรวม"] }), col("count", "จำนวน", "number"), col("amount", "จำนวนเงิน", "number")], { min_rows: 6 }),
          num("counted", "ยอดนับได้", "บาท"), num("system", "ยอดในระบบ", "บาท"), num("diff", "ส่วนต่าง", "บาท"),
          txt("diff_reason", "เหตุผลส่วนต่าง", { width: "full", required: false }),
        ] },
        { title: "ลงนาม", fields: [sign("sign_cashier", "แคชเชียร์"), sign("sign_manager", "ผู้จัดการกะ")] },
      ],
    },
  },
  {
    id: "fertigation-log", industries: ["agriculture"],
    schema: {
      title: "บันทึกการให้น้ำและปุ๋ย", icon: "💧", category: "production",
      description: "บันทึกการให้น้ำ/ปุ๋ยรายแปลง ค่า EC และ pH ของสารละลาย เพื่อคุมคุณภาพผลผลิตตามมาตรฐาน GAP",
      steps: [
        { title: "แปลง", fields: [scan("plot", "แปลง/โรงเรือน"), txt("crop", "พืช"), when("applied_at", "วันเวลา")] },
        { title: "การให้น้ำและปุ๋ย", fields: [
          num("water", "ปริมาณน้ำ", "ลิตร"), txt("fertilizer", "สูตรปุ๋ย", { required: false }), num("rate", "อัตราปุ๋ย", "กก./ไร่", { required: false }),
          num("ec", "ค่า EC", "mS/cm", { min: 0.8, max: 2.5 }), num("ph", "ค่า pH", "", { min: 5.5, max: 6.8 }),
          pf("leak", "ระบบน้ำหยด/สปริงเกอร์ไม่รั่ว ไม่อุดตัน"),
          txt("operator", "ผู้ปฏิบัติ"),
        ] },
      ],
    },
  },
  {
    id: "pool-water", industries: ["hospitality", "facilities"],
    schema: {
      title: "ตรวจคุณภาพน้ำสระว่ายน้ำ", icon: "🏊", category: "inspection",
      description: "วัดค่าคลอรีนและ pH ของสระวันละหลายรอบ ค่าเกินเกณฑ์ให้ปิดสระและบันทึกการแก้ไข",
      steps: [
        { title: "รอบตรวจ", fields: [sel("pool", "สระ", ["สระหลัก", "สระเด็ก", "จากุซซี่"]), when("tested_at", "เวลาตรวจ"), txt("tester", "ผู้ตรวจ")] },
        { title: "ค่าน้ำ", fields: [
          num("chlorine", "คลอรีนอิสระ", "ppm", { min: 1, max: 3 }), num("ph", "ค่า pH", "", { min: 7.2, max: 7.8 }),
          num("temp", "อุณหภูมิน้ำ", "°C", { required: false }),
          pf("clear", "น้ำใส มองเห็นพื้นสระ"), pf("safety", "ห่วงชูชีพ/ป้ายเตือนครบ"),
          sel("status", "สถานะสระ", ["เปิดใช้งาน", "ปิดชั่วคราว"]),
          txt("action", "การแก้ไข (ถ้ามี)", { width: "full", required: false }),
        ] },
      ],
    },
  },
  {
    id: "transformer-inspection", industries: ["energy", "facilities", "manufacturing"],
    schema: {
      title: "ตรวจหม้อแปลงไฟฟ้า", icon: "⚡", category: "maintenance",
      description: "ตรวจหม้อแปลงไฟฟ้าประจำเดือน: อุณหภูมิ ระดับน้ำมัน รอยรั่ว และค่าโหลด",
      steps: [
        { title: "หม้อแปลง", fields: [scan("tr_id", "รหัสหม้อแปลง"), sel("kva", "ขนาด", ["250 kVA", "500 kVA", "1000 kVA", "1500 kVA", "2000 kVA"]), when("inspected_at", "วันที่ตรวจ")] },
        { title: "การตรวจ", fields: [
          num("oil_temp", "อุณหภูมิน้ำมัน", "°C", { max: 90 }), num("load", "โหลดสูงสุด", "%", { max: 80 }),
          pf("oil_level", "ระดับน้ำมันปกติ"), pf("leak", "ไม่มีน้ำมันรั่วซึม"), pf("silica", "ซิลิกาเจลยังไม่เปลี่ยนสี"),
          pf("fence", "รั้ว/ป้ายเตือนอันตรายครบ"),
          photo("photo", "รูปหม้อแปลงและหน้าปัด"),
          sign("sign", "ลายเซ็นช่างไฟฟ้า"),
        ] },
      ],
    },
  },
  {
    id: "equipment-loan", industries: ["education", "general", "healthcare"],
    schema: {
      title: "ยืม-คืนอุปกรณ์", icon: "📦", category: "other",
      description: "บันทึกการยืมและคืนอุปกรณ์ส่วนกลาง (โน้ตบุ๊ก โปรเจกเตอร์ เครื่องมือ) พร้อมสภาพตอนคืน",
      steps: [
        { title: "การยืม", fields: [scan("asset", "รหัสอุปกรณ์"), txt("borrower", "ผู้ยืม"), txt("dept", "หน่วยงาน/ห้องเรียน"), when("borrowed_at", "วันเวลายืม"), when("due", "กำหนดคืน")] },
        { title: "การคืน", fields: [
          when("returned_at", "วันเวลาคืน", { required: false }),
          sel("condition", "สภาพตอนคืน", ["ปกติ", "ชำรุดเล็กน้อย", "ชำรุดใช้งานไม่ได้", "สูญหาย"], { required: false }),
          chk("parts", "อุปกรณ์ที่คืนครบ", ["ตัวเครื่อง", "สายชาร์จ/สายไฟ", "กระเป๋า", "รีโมต"]),
          sign("sign", "ลายเซ็นผู้ยืม"),
        ] },
      ],
    },
  },
  {
    id: "trailer-inspection", industries: ["port", "logistics"],
    schema: {
      title: "ตรวจสภาพหางพ่วง/แชสซี", icon: "🛞", category: "inspection",
      description: "ตรวจหางพ่วงและแชสซีก่อนรับตู้ที่ท่าเรือ: ยาง ไฟ ล็อกตู้ (twist lock) และเบรก",
      steps: [
        { title: "ข้อมูล", fields: [txt("chassis", "เลขแชสซี/หาง"), txt("tractor", "ทะเบียนหัวลาก"), txt("driver", "พนักงานขับ"), when("checked_at", "เวลาตรวจ")] },
        { title: "รายการตรวจ", fields: [
          pf("twistlock", "Twist lock ครบและล็อกได้ทุกมุม"), pf("tires", "ยางไม่สึกเกินเกณฑ์ ไม่มีบวม"), pf("lights", "ไฟท้าย/ไฟเบรก/ไฟเลี้ยวทำงาน"),
          pf("brake", "ระบบเบรกลม/สายลมไม่รั่ว"), pf("landing", "ขาค้ำ (landing gear) ใช้งานได้"),
          photo("photo", "รูปหางพ่วงและจุดผิดปกติ"),
          sign("sign", "ลายเซ็นผู้ตรวจ"),
        ] },
      ],
    },
  },
];
