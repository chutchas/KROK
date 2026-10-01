// ============================================================
// KROK · คลังตัวอย่างคำสั่งสร้างฟอร์มด้วย AI — แบ่ง 2 แบบ: ตามลักษณะงาน / ตามอุตสาหกรรม
//
// ครอบคลุมหลายอุตสาหกรรม และไม่ซ้ำกับคลังเทมเพลต · ปุ่มแสดงแค่ชื่อสั้น (เหมือนหน้าเทมเพลต) · กดแล้วเติมคำสั่งเต็มลงช่อง prompt:
//   ชื่อ + รายละเอียด + ขั้นตอน + ฟิลด์ (ชนิด, ตัวเลือก, หน่วย/ช่วงที่ยอมรับ) → AI สร้างได้ตรงกว่าการส่งแค่ชื่อ
//
// ฟิลด์เขียนย่อเป็นสตริง: "ชื่อไทย|English|ชนิด" หรือ "ชื่อไทย|English|ชนิด|รายละเอียดไทย|English detail"
//   ชนิด = text number select checkbox pass_fail photo barcode signature datetime table
//   select/checkbox → รายละเอียด = ตัวเลือกคั่นด้วย ","   table → คอลัมน์คั่นด้วย ","
//   number → หน่วย/ช่วงที่ยอมรับ (ข้อความอิสระ)
// ============================================================
import type { Lang } from "@/i18n/dictionaries";

export const PROMPT_FIELD_TYPES = ["text", "number", "select", "checkbox", "pass_fail", "photo", "barcode", "signature", "datetime", "table"] as const;
export type PromptFieldType = (typeof PROMPT_FIELD_TYPES)[number];

interface StepSpec { th: string; en: string; fields: string[] }
export interface PromptSpec {
  /** ชื่อสั้นบนปุ่ม */
  th: string; en: string;
  /** อธิบายฟอร์ม 1 ประโยค */
  dth: string; den: string;
  steps: StepSpec[];
}
export interface PromptItem { id: string; th: string; en: string }
export interface PromptGroup { key: string; th: string; en: string; items: PromptItem[] }

const SPECS: Record<string, PromptSpec> = {
  forklift: {
    th: "ตรวจสภาพ Forklift ก่อนใช้งาน", en: "Forklift pre-use check",
    dth: "ใบตรวจสภาพรถยกก่อนใช้งานประจำวัน ทำโดยพนักงานขับก่อนเริ่มกะ", den: "Daily forklift pre-use inspection done by the driver before the shift",
    steps: [
      { th: "ข้อมูลรถ", en: "Unit info", fields: ["รหัสรถ|Unit ID|barcode|สแกน QR ประจำรถ|scan the unit QR", "ชั่วโมงเครื่อง|Hour meter|number|ชม.|hrs", "กะ|Shift|select|เช้า,บ่าย,ดึก|Morning,Afternoon,Night"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["ยาง|Tires|pass_fail", "เบรก/เบรกมือ|Brakes / parking brake|pass_fail", "ไฟเตือน/แตร|Warning lights / horn|pass_fail", "โซ่/งายก|Mast chains / forks|pass_fail", "น้ำมันไฮดรอลิก/รอยรั่ว|Hydraulic oil / leaks|pass_fail", "ระดับแบตเตอรี่/น้ำมัน|Battery / fuel level|number|%|%"] },
      { th: "หลักฐาน", en: "Evidence", fields: ["รูปสภาพรถ|Unit photo|photo", "หมายเหตุ|Notes|text", "ลายเซ็นผู้ตรวจ|Inspector signature|signature"] },
    ],
  },
  vehicle_pretrip: {
    th: "ตรวจรถก่อนออกวิ่ง", en: "Vehicle pre-trip check",
    dth: "ตรวจเช็กรถขนส่งก่อนออกวิ่ง ทำโดยพนักงานขับ", den: "Driver's vehicle check before leaving on a trip",
    steps: [
      { th: "ข้อมูลรถ", en: "Vehicle info", fields: ["ทะเบียนรถ|License plate|barcode|สแกน QR ประจำรถ|scan the vehicle QR", "พนักงานขับ|Driver|text", "เลขไมล์|Odometer|number|กม.|km"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["น้ำมันเครื่อง/น้ำหล่อเย็น|Engine oil / coolant|pass_fail", "ลมยางและสภาพยาง|Tire pressure and condition|pass_fail", "ไฟหน้า/ไฟเบรก/ไฟเลี้ยว|Head, brake and turn lights|pass_fail", "เบรก|Brakes|pass_fail", "เอกสารประจำรถครบ|Vehicle documents on board|checkbox|ทะเบียนรถ,ประกัน,ใบขับขี่,ใบงาน|Registration,Insurance,License,Job sheet", "ระดับน้ำมัน|Fuel level|select|เต็ม,3/4,1/2,1/4|Full,3/4,1/2,1/4"] },
      { th: "หลักฐาน", en: "Evidence", fields: ["รูปรอบคัน|Vehicle photos|photo", "ลายเซ็นพนักงานขับ|Driver signature|signature"] },
    ],
  },
  store_openclose: {
    th: "เปิด-ปิดร้านประจำวัน", en: "Store open/close",
    dth: "เช็กลิสต์เปิด-ปิดร้านประจำวัน", den: "Daily store opening and closing checklist",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["สาขา|Branch|select|สาขา 1,สาขา 2,สาขา 3|Branch 1,Branch 2,Branch 3", "รอบ|Round|select|เปิดร้าน,ปิดร้าน|Opening,Closing", "พนักงาน|Staff|text"] },
      { th: "เช็กลิสต์", en: "Checklist", fields: ["ไฟ/แอร์/ป้ายหน้าร้าน|Lights / AC / signage|pass_fail", "เครื่อง POS และลิ้นชักเงิน|POS and cash drawer|pass_fail", "เงินสดในลิ้นชัก|Cash in drawer|number|บาท|THB", "ความสะอาดหน้าร้าน|Storefront clean|pass_fail", "ประตู/ล็อก/สัญญาณกันขโมย|Doors / locks / alarm|pass_fail"] },
      { th: "ยืนยัน", en: "Sign-off", fields: ["รูปหน้าร้าน|Store photo|photo", "ลายเซ็นพนักงาน|Staff signature|signature"] },
    ],
  },
  gmp_kitchen: {
    th: "สุขลักษณะครัวตาม GMP", en: "GMP kitchen hygiene",
    dth: "ตรวจสุขลักษณะครัว/พื้นที่ผลิตอาหารตามหลัก GMP", den: "Kitchen / food-production hygiene check per GMP",
    steps: [
      { th: "ข้อมูลการตรวจ", en: "Audit info", fields: ["พื้นที่|Area|select|ครัวร้อน,ครัวเย็น,ห้องเตรียม,ห้องล้าง|Hot kitchen,Cold kitchen,Prep room,Dishwashing", "ผู้ตรวจ|Auditor|text", "วันเวลา|Date & time|datetime"] },
      { th: "บุคลากร", en: "Personnel", fields: ["แต่งกายถูกต้อง (หมวก ผ้ากันเปื้อน)|Proper attire (hairnet, apron)|pass_fail", "ล้างมือ/สุขอนามัยส่วนบุคคล|Hand washing / personal hygiene|pass_fail"] },
      { th: "พื้นที่และอุปกรณ์", en: "Area and equipment", fields: ["พื้น ผนัง ท่อระบายน้ำสะอาด|Floors, walls, drains clean|pass_fail", "แยกเขียงดิบ/สุก|Raw/cooked boards separated|pass_fail", "ไม่มีสัตว์พาหะ|No pests|pass_fail", "อุณหภูมิตู้แช่|Chiller temperature|number|°C ยอมรับ 0-5|°C, accepted 0-5", "รูปจุดที่พบปัญหา|Photos of issues|photo"] },
    ],
  },
  coldroom_temp: {
    th: "บันทึกอุณหภูมิห้องเย็น/ตู้แช่", en: "Cold room / freezer temperature",
    dth: "บันทึกอุณหภูมิห้องเย็นหรือตู้แช่รายชั่วโมง มีช่วงที่ยอมรับ ค่าเกินให้ถือว่าไม่ผ่าน", den: "Hourly cold room / freezer temperature log with accepted range; out of range counts as a fail",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["ห้อง/ตู้|Room / unit|barcode|สแกน QR หน้าห้อง|scan the room QR", "เวลาบันทึก|Reading time|datetime"] },
      { th: "ค่าที่วัด", en: "Readings", fields: ["อุณหภูมิ|Temperature|number|°C ยอมรับ -25 ถึง -18|°C, accepted -25 to -18", "ความชื้น|Humidity|number|%RH|%RH", "ประตูปิดสนิท|Door sealed|pass_fail", "รูปหน้าจอเทอร์โมมิเตอร์|Thermometer display photo|photo", "การแก้ไขเมื่อค่าเกิน|Corrective action if out of range|text"] },
    ],
  },
  meter_reading: {
    th: "บันทึกมิเตอร์น้ำ/ไฟ/ลม", en: "Utility meter readings",
    dth: "บันทึกค่ามิเตอร์น้ำ ไฟ และลมอัดประจำวัน", den: "Daily water, electricity and compressed-air meter readings",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["จุดมิเตอร์|Meter point|barcode", "วันที่|Date|datetime", "ผู้จด|Recorded by|text"] },
      { th: "ค่าที่อ่าน", en: "Readings", fields: ["มิเตอร์ไฟฟ้า|Electricity meter|number|kWh|kWh", "มิเตอร์น้ำ|Water meter|number|m³|m³", "แรงดันลมอัด|Compressed air pressure|number|bar ยอมรับ 6-8|bar, accepted 6-8", "รูปหน้าปัดมิเตอร์|Meter photo|photo"] },
    ],
  },
  machine_params: {
    th: "บันทึกพารามิเตอร์เครื่องจักร", en: "Machine parameter log",
    dth: "บันทึกพารามิเตอร์การผลิตของเครื่องจักรทุกกะ/ทุกชั่วโมง", den: "Production parameter log for a machine every shift / hour",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["เครื่องจักร|Machine|barcode", "รุ่นสินค้า|Product model|text", "กะ|Shift|select|เช้า,บ่าย,ดึก|Morning,Afternoon,Night"] },
      { th: "พารามิเตอร์", en: "Parameters", fields: ["ค่ารายชั่วโมง|Hourly readings|table|เวลา,อุณหภูมิ (°C),แรงดัน (bar),ความเร็ว (rpm),ผลิตได้ (ชิ้น)|Time,Temp (°C),Pressure (bar),Speed (rpm),Output (pcs)", "ของเสียรวม|Total scrap|number|ชิ้น|pcs", "ปัญหาที่พบ|Issues|text", "ลายเซ็นหัวหน้ากะ|Shift leader signature|signature"] },
    ],
  },
  iqc: {
    th: "ตรวจรับวัตถุดิบ (IQC)", en: "Incoming QC (IQC)",
    dth: "ใบตรวจรับคุณภาพวัตถุดิบเข้า", den: "Incoming material quality inspection",
    steps: [
      { th: "ข้อมูลการรับ", en: "Receiving info", fields: ["ผู้ขาย|Supplier|text", "เลขที่ PO|PO number|barcode", "รหัสวัตถุดิบ/Lot|Material / lot|text", "จำนวนที่รับ|Quantity received|number|หน่วย|units"] },
      { th: "การตรวจ", en: "Inspection", fields: ["ใบ COA ครบ|COA provided|pass_fail", "บรรจุภัณฑ์สมบูรณ์|Packaging intact|pass_fail", "ขนาด/สเปกตามมาตรฐาน|Size / spec conforms|pass_fail", "จำนวนสุ่มตรวจ|Sample size|number|ชิ้น|pcs", "รูปวัตถุดิบ/ฉลาก|Material / label photo|photo"] },
      { th: "ผลการตรวจ", en: "Result", fields: ["ผลสรุป|Decision|select|รับ,รับแบบมีเงื่อนไข,ปฏิเสธ|Accept,Conditional,Reject", "ลายเซ็นผู้ตรวจ|Inspector signature|signature"] },
    ],
  },
  ncr: {
    th: "บันทึกของเสีย (NCR)", en: "Non-conformance (NCR)",
    dth: "บันทึกของเสีย/ของไม่ผ่าน พร้อมสาเหตุ การแก้ไข และรูป", den: "Non-conformance report with cause, action and photos",
    steps: [
      { th: "ปัญหา", en: "Issue", fields: ["รหัสชิ้นงาน/Lot|Part / lot|barcode", "จำนวนที่เสีย|Defective qty|number|ชิ้น|pcs", "ประเภทปัญหา|Defect type|select|ขนาดผิด,ผิวเสีย,ประกอบผิด,วัตถุดิบไม่ดี,อื่นๆ|Wrong size,Surface defect,Assembly error,Bad material,Other", "รายละเอียด|Description|text", "รูปของเสีย|Defect photos|photo"] },
      { th: "สาเหตุและการแก้ไข", en: "Cause and action", fields: ["สาเหตุ|Root cause|checkbox|คน,เครื่องจักร,วิธีการ,วัตถุดิบ|Man,Machine,Method,Material", "การจัดการ|Disposition|select|ซ่อม,คัดแยก,ทิ้ง,ส่งคืนผู้ขาย|Rework,Sort,Scrap,Return to supplier", "การป้องกันไม่ให้เกิดซ้ำ|Preventive action|text", "ลายเซ็นผู้รายงาน|Reporter signature|signature"] },
    ],
  },
  cycle_count: {
    th: "ตรวจนับสต็อกรอบ", en: "Cycle count",
    dth: "ตรวจนับสต็อกรอบ (cycle count) เทียบกับยอดในระบบ", den: "Cycle count against system stock",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["ตำแหน่งจัดเก็บ|Bin location|barcode", "ผู้นับ|Counter|text", "วันที่|Date|datetime"] },
      { th: "ผลการนับ", en: "Count", fields: ["รายการนับ|Count lines|table|รหัสสินค้า,ยอดในระบบ,นับได้จริง,ส่วนต่าง|SKU,System qty,Counted,Variance", "สาเหตุส่วนต่าง|Variance reason|text", "รูปตำแหน่งจัดเก็บ|Bin photo|photo"] },
    ],
  },
  contractor_checkin: {
    th: "Check-in ผู้รับเหมา", en: "Contractor check-in",
    dth: "check-in ผู้รับเหมาเข้าพื้นที่โรงงาน ตรวจบัตร PPE และการอบรมความปลอดภัย", den: "Contractor site check-in: ID, PPE and safety briefing",
    steps: [
      { th: "ข้อมูลผู้รับเหมา", en: "Contractor", fields: ["ชื่อ-สกุล|Full name|text", "บริษัท|Company|text", "เลขบัตรประชาชน/บัตรพนักงาน|ID number|barcode", "พื้นที่ที่เข้าทำงาน|Work area|text"] },
      { th: "ความปลอดภัย", en: "Safety", fields: ["PPE ที่มี|PPE worn|checkbox|หมวกนิรภัย,รองเท้านิรภัย,แว่นตา,ถุงมือ,เสื้อสะท้อนแสง|Helmet,Safety shoes,Glasses,Gloves,Hi-vis vest", "ผ่านการอบรมความปลอดภัย|Safety briefing done|pass_fail", "รูปถ่ายผู้รับเหมา|Contractor photo|photo", "ลายเซ็นผู้รับเหมา|Contractor signature|signature"] },
    ],
  },
  visitor: {
    th: "ลงทะเบียนผู้มาติดต่อ", en: "Visitor registration",
    dth: "ลงทะเบียนผู้มาติดต่อ (visitor) เข้า-ออกพื้นที่", den: "Visitor sign-in and sign-out",
    steps: [
      { th: "ผู้มาติดต่อ", en: "Visitor", fields: ["ชื่อ-สกุล|Full name|text", "บริษัท|Company|text", "เบอร์โทร|Phone|text", "ผู้ที่มาพบ|Host|text", "วัตถุประสงค์|Purpose|select|ประชุม,ส่งของ,ซ่อมบำรุง,สัมภาษณ์งาน,อื่นๆ|Meeting,Delivery,Maintenance,Interview,Other"] },
      { th: "บันทึก", en: "Record", fields: ["เวลาเข้า|Time in|datetime", "เลขบัตรผู้มาติดต่อ|Visitor badge no.|text", "รูปถ่าย|Photo|photo", "ลายเซ็น|Signature|signature"] },
    ],
  },
  permit_to_work: {
    th: "Permit to Work งานเสี่ยง", en: "Permit to work",
    dth: "ใบอนุญาตทำงานเสี่ยง (งานร้อน ที่อับอากาศ ที่สูง) ต้องอนุมัติก่อนเริ่มงาน", den: "Permit for high-risk jobs (hot work, confined space, height), approved before work starts",
    steps: [
      { th: "รายละเอียดงาน", en: "Job details", fields: ["ประเภทงาน|Work type|select|งานร้อน,ที่อับอากาศ,ที่สูง,งานไฟฟ้า|Hot work,Confined space,Work at height,Electrical", "สถานที่|Location|text", "ผู้รับผิดชอบงาน|Person in charge|text", "เวลาเริ่ม-สิ้นสุด|Start - end time|datetime"] },
      { th: "มาตรการความปลอดภัย", en: "Safety measures", fields: ["มาตรการที่เตรียม|Measures in place|checkbox|ตัดแยกพลังงาน (LOTO),ตรวจวัดก๊าซ,ถังดับเพลิง,ผู้เฝ้าระวัง,เข็มขัดนิรภัย|Energy isolation (LOTO),Gas test,Fire extinguisher,Standby watcher,Safety harness", "ค่าออกซิเจน|Oxygen level|number|% ยอมรับ 19.5-23.5|%, accepted 19.5-23.5", "รูปหน้างาน|Site photo|photo"] },
      { th: "อนุมัติ", en: "Approval", fields: ["ลายเซ็นผู้ขออนุญาต|Applicant signature|signature", "ลายเซ็นเจ้าหน้าที่ความปลอดภัย|Safety officer signature|signature"] },
    ],
  },
  repair_request: {
    th: "แจ้งซ่อมเครื่องจักร", en: "Repair request",
    dth: "ใบแจ้งซ่อม/แจ้งปัญหาเครื่องจักร พร้อมรูป", den: "Machine breakdown / repair request with photos",
    steps: [
      { th: "แจ้งปัญหา", en: "Report", fields: ["เครื่องจักร|Machine|barcode", "อาการเสีย|Symptom|text", "ความเร่งด่วน|Priority|select|ด่วนมาก (ไลน์หยุด),ด่วน,ปกติ|Critical (line down),Urgent,Normal", "รูปปัญหา|Problem photos|photo", "ผู้แจ้ง|Reported by|text"] },
      { th: "ผลการซ่อม", en: "Repair", fields: ["สาเหตุ|Cause|text", "อะไหล่ที่ใช้|Parts used|table|อะไหล่,จำนวน|Part,Qty", "เวลาที่ใช้ซ่อม|Repair time|number|นาที|minutes", "ลายเซ็นช่าง|Technician signature|signature"] },
    ],
  },
  pm: {
    th: "PM บำรุงรักษาตามรอบ", en: "Preventive maintenance",
    dth: "เช็กลิสต์บำรุงรักษาเชิงป้องกัน (PM) ตามรอบ", den: "Preventive maintenance (PM) checklist by schedule",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["เครื่องจักร|Machine|barcode", "รอบ PM|PM interval|select|รายสัปดาห์,รายเดือน,ราย 3 เดือน,รายปี|Weekly,Monthly,Quarterly,Yearly", "ช่าง|Technician|text"] },
      { th: "รายการ PM", en: "PM tasks", fields: ["หล่อลื่นจุดหมุน|Lubricate moving parts|pass_fail", "ตรวจสายพาน/โซ่|Check belts / chains|pass_fail", "ขันน็อตยึด|Tighten fasteners|pass_fail", "ทำความสะอาดฟิลเตอร์|Clean filters|pass_fail", "ค่าการสั่นสะเทือน|Vibration|number|mm/s ยอมรับไม่เกิน 4.5|mm/s, accepted up to 4.5", "รูปหลังทำ PM|Photo after PM|photo", "ลายเซ็นช่าง|Technician signature|signature"] },
    ],
  },
  fire_ext: {
    th: "ตรวจถังดับเพลิงประจำเดือน", en: "Fire extinguisher check",
    dth: "ตรวจถังดับเพลิงและระบบดับเพลิงประจำเดือน", den: "Monthly fire extinguisher and fire-system check",
    steps: [
      { th: "ข้อมูลถัง", en: "Extinguisher", fields: ["รหัสถัง|Extinguisher ID|barcode", "ชนิด|Type|select|ผงเคมีแห้ง,CO2,โฟม,น้ำยาสูตรน้ำ|Dry chemical,CO2,Foam,Water-based", "ตำแหน่ง|Location|text"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["เข็มแรงดันอยู่ช่องเขียว|Gauge in green|pass_fail", "สลักและซีลสมบูรณ์|Pin and seal intact|pass_fail", "สายฉีด/หัวฉีดไม่ชำรุด|Hose / nozzle OK|pass_fail", "ป้ายและทางเข้าถึงไม่ถูกบัง|Sign visible, access clear|pass_fail", "วันหมดอายุ|Expiry date|datetime", "รูปถัง|Photo|photo", "ลายเซ็นผู้ตรวจ|Inspector signature|signature"] },
    ],
  },
  site_ppe: {
    th: "ตรวจ PPE ก่อนเข้าไซต์", en: "Site PPE check",
    dth: "ตรวจ PPE และความพร้อมด้านความปลอดภัยของคนงานก่อนเข้าไซต์ก่อสร้าง", den: "PPE and safety readiness check before workers enter the construction site",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["ไซต์งาน|Site|text", "ผู้ควบคุมงาน|Supervisor|text", "จำนวนคนงาน|Number of workers|number|คน|people"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["หมวกนิรภัยครบทุกคน|Helmets for all|pass_fail", "รองเท้านิรภัย|Safety shoes|pass_fail", "เข็มขัดนิรภัยสำหรับงานที่สูง|Harness for work at height|pass_fail", "ประชุมความปลอดภัยก่อนเริ่มงาน (toolbox talk)|Toolbox talk held|pass_fail", "รูปหน้างาน|Site photo|photo", "ลายเซ็นผู้ควบคุมงาน|Supervisor signature|signature"] },
    ],
  },
  scaffold: {
    th: "ตรวจนั่งร้านก่อนใช้งาน", en: "Scaffold inspection",
    dth: "ตรวจนั่งร้าน (scaffold) ก่อนใช้งาน ติดป้ายพร้อมใช้/ห้ามใช้", den: "Scaffold pre-use inspection with ready / do-not-use tag",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["รหัส/ตำแหน่งนั่งร้าน|Scaffold ID / location|barcode", "ความสูง|Height|number|เมตร|m", "ผู้ตรวจ|Inspector|text"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["ฐานรองและแผ่นรองมั่นคง|Base plates stable|pass_fail", "ค้ำยันและข้อต่อแน่น|Braces and couplers tight|pass_fail", "แผ่นทางเดินครบ ไม่มีช่องว่าง|Planks complete, no gaps|pass_fail", "ราวกันตกและแผ่นกันของตก|Guardrails and toe boards|pass_fail", "สถานะป้าย|Tag status|select|พร้อมใช้ (เขียว),ห้ามใช้ (แดง)|Ready (green),Do not use (red)", "รูปนั่งร้าน|Scaffold photo|photo", "ลายเซ็นผู้ตรวจ|Inspector signature|signature"] },
    ],
  },
  ingredient_receiving: {
    th: "ตรวจรับวัตถุดิบเข้าครัว", en: "Ingredient receiving",
    dth: "ใบตรวจรับวัตถุดิบอาหารเข้าครัว ตรวจอุณหภูมิและวันหมดอายุ", den: "Food ingredient receiving check: temperature and expiry",
    steps: [
      { th: "ข้อมูลการรับ", en: "Receiving info", fields: ["ผู้ขาย|Supplier|text", "เวลารับ|Received at|datetime", "ประเภทวัตถุดิบ|Category|select|เนื้อสัตว์,อาหารทะเล,ผักผลไม้,ของแห้ง,นม/ไข่|Meat,Seafood,Produce,Dry goods,Dairy/eggs"] },
      { th: "การตรวจ", en: "Checks", fields: ["อุณหภูมิขณะรับ|Temperature on arrival|number|°C ของสดยอมรับไม่เกิน 5|°C, chilled accepted up to 5", "วันหมดอายุ|Expiry date|datetime", "สภาพ/กลิ่น/สี ปกติ|Condition, smell, color OK|pass_fail", "บรรจุภัณฑ์สมบูรณ์|Packaging intact|pass_fail", "รูปวัตถุดิบ|Photo|photo", "ลายเซ็นผู้รับ|Receiver signature|signature"] },
    ],
  },
  shelf_check: {
    th: "ตรวจสต็อกและป้ายราคา", en: "Shelf and price-tag check",
    dth: "ตรวจสต็อกบนชั้นวางและความถูกต้องของป้ายราคา", den: "Shelf stock and price-tag accuracy check",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["สาขา|Branch|text", "โซน/ชั้นวาง|Aisle / shelf|text", "ผู้ตรวจ|Checked by|text"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["รายการสินค้า|Items|table|บาร์โค้ด,ชื่อสินค้า,ราคาป้าย,ราคาระบบ,จำนวนบนชั้น|Barcode,Item,Tag price,System price,On shelf", "สินค้าขาดชั้น|Out-of-stock items|text", "จัดเรียงหน้าสินค้าเรียบร้อย|Facing neat|pass_fail", "รูปชั้นวาง|Shelf photo|photo"] },
    ],
  },
  storefront_clean: {
    th: "ความสะอาดหน้าร้าน", en: "Storefront cleanliness",
    dth: "ตรวจความสะอาดและความเรียบร้อยหน้าร้าน", den: "Storefront cleanliness and tidiness check",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["สาขา|Branch|text", "รอบตรวจ|Round|select|เช้า,บ่าย,เย็น|Morning,Afternoon,Evening"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["พื้นและทางเดิน|Floors and aisles|pass_fail", "กระจกและประตู|Glass and doors|pass_fail", "ห้องน้ำ|Restrooms|pass_fail", "ถังขยะ|Trash bins|pass_fail", "ป้ายโปรโมชันถูกต้อง|Promo signage correct|pass_fail", "รูปหน้าร้าน|Store photo|photo"] },
    ],
  },
  room_housekeeping: {
    th: "ตรวจความสะอาดห้องพัก", en: "Room housekeeping check",
    dth: "ตรวจความสะอาดและความพร้อมของห้องพักหลังแม่บ้านทำความสะอาด", den: "Guest-room cleanliness and readiness check after housekeeping",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["หมายเลขห้อง|Room number|barcode", "แม่บ้าน|Housekeeper|text", "สถานะห้อง|Room status|select|ห้องว่างพร้อมขาย,ลูกค้าพักต่อ,ห้องเช็กเอาต์|Vacant ready,Stay-over,Check-out"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["เตียงและผ้าปู|Bed and linen|pass_fail", "ห้องน้ำและผ้าเช็ดตัว|Bathroom and towels|pass_fail", "ของใช้ในห้องครบ|Amenities complete|checkbox|สบู่/แชมพู,น้ำดื่ม,กาแฟ/ชา,ทิชชู่|Soap/shampoo,Water,Coffee/tea,Tissue", "ทีวี/แอร์/ไฟ ใช้งานได้|TV / AC / lights work|pass_fail", "รูปห้อง|Room photo|photo", "ลายเซ็นผู้ตรวจ|Inspector signature|signature"] },
    ],
  },
  common_area: {
    th: "ตรวจพื้นที่ส่วนกลาง", en: "Common-area check",
    dth: "ตรวจพื้นที่ส่วนกลางและสิ่งอำนวยความสะดวก", den: "Common-area and facilities check",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["พื้นที่|Area|select|ล็อบบี้,สระว่ายน้ำ,ฟิตเนส,ลานจอดรถ,ทางเดิน|Lobby,Pool,Gym,Car park,Corridors", "ผู้ตรวจ|Inspector|text", "เวลา|Time|datetime"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["ความสะอาด|Cleanliness|pass_fail", "ไฟส่องสว่าง|Lighting|pass_fail", "อุปกรณ์ใช้งานได้|Equipment working|pass_fail", "ป้ายความปลอดภัย/ทางหนีไฟ|Safety and exit signs|pass_fail", "รูปจุดที่พบปัญหา|Photos of issues|photo", "รายละเอียดปัญหา|Issue details|text"] },
    ],
  },
  meeting_room: {
    th: "เช็กห้องประชุมก่อนใช้งาน", en: "Meeting-room check",
    dth: "เช็กอุปกรณ์ในห้องประชุมก่อนใช้งาน", den: "Meeting-room equipment check before use",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["ห้องประชุม|Meeting room|select|ห้อง A,ห้อง B,ห้องใหญ่|Room A,Room B,Ballroom", "เวลาเริ่มประชุม|Meeting start|datetime", "จำนวนผู้เข้าร่วม|Attendees|number|คน|people"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["โปรเจกเตอร์/จอ|Projector / screen|pass_fail", "ไมโครโฟนและเครื่องเสียง|Microphones and audio|pass_fail", "Wi-Fi|Wi-Fi|pass_fail", "จัดโต๊ะ เก้าอี้ น้ำดื่ม|Tables, chairs, water set|pass_fail", "รูปห้อง|Room photo|photo"] },
    ],
  },
  fuel_log: {
    th: "บันทึกเลขไมล์และเติมน้ำมัน", en: "Mileage and fuel log",
    dth: "บันทึกเลขไมล์และการเติมน้ำมันของรถแต่ละคัน", den: "Odometer and refueling log per vehicle",
    steps: [
      { th: "ข้อมูลรถ", en: "Vehicle", fields: ["ทะเบียนรถ|License plate|barcode", "พนักงานขับ|Driver|text", "เวลาเติม|Refuel time|datetime"] },
      { th: "การเติมน้ำมัน", en: "Refueling", fields: ["เลขไมล์|Odometer|number|กม.|km", "ปริมาณที่เติม|Liters|number|ลิตร|L", "ยอดเงิน|Amount|number|บาท|THB", "สถานีบริการ|Station|text", "รูปใบเสร็จ|Receipt photo|photo", "รูปหน้าปัดเลขไมล์|Odometer photo|photo"] },
    ],
  },
  post_trip: {
    th: "ตรวจรถหลังกลับเข้าอู่", en: "Post-trip check",
    dth: "ตรวจสภาพรถหลังกลับเข้าอู่ (post-trip) และแจ้งความเสียหาย", den: "Post-trip vehicle check on return, with damage report",
    steps: [
      { th: "ข้อมูลรถ", en: "Vehicle", fields: ["ทะเบียนรถ|License plate|barcode", "พนักงานขับ|Driver|text", "เลขไมล์เมื่อกลับ|Odometer on return|number|กม.|km"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["ตัวถังไม่มีรอยเสียหายใหม่|No new body damage|pass_fail", "ยางและล้อ|Tires and wheels|pass_fail", "ห้องโดยสารสะอาด|Cab clean|pass_fail", "ระดับน้ำมันที่เหลือ|Fuel remaining|select|เต็ม,3/4,1/2,1/4,ใกล้หมด|Full,3/4,1/2,1/4,Near empty", "รูปรอบคัน|Vehicle photos|photo", "ปัญหาที่ต้องซ่อม|Defects to repair|text", "ลายเซ็นพนักงานขับ|Driver signature|signature"] },
    ],
  },
  building_systems: {
    th: "ตรวจลิฟต์/ไฟฟ้า/ปั๊มน้ำ", en: "Building systems check",
    dth: "ตรวจระบบอาคาร: ลิฟต์ ระบบไฟฟ้า และปั๊มน้ำ", den: "Building systems check: elevators, electrical and water pumps",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["อาคาร|Building|text", "ช่าง|Technician|text", "วันที่|Date|datetime"] },
      { th: "ลิฟต์", en: "Elevators", fields: ["ลิฟต์ทำงานปกติ ไม่มีเสียงผิดปกติ|Runs normally, no odd noise|pass_fail", "ปุ่มฉุกเฉิน/อินเตอร์คอม|Emergency button / intercom|pass_fail"] },
      { th: "ไฟฟ้าและปั๊มน้ำ", en: "Electrical and pumps", fields: ["แรงดันไฟฟ้า|Voltage|number|V ยอมรับ 380-420|V, accepted 380-420", "ตู้ไฟไม่มีความร้อนผิดปกติ|No hot spots in panels|pass_fail", "แรงดันปั๊มน้ำ|Pump pressure|number|bar|bar", "รูปตู้ไฟ/ปั๊ม|Panel / pump photo|photo", "ลายเซ็นช่าง|Technician signature|signature"] },
    ],
  },
  building_walk: {
    th: "ตรวจความปลอดภัยอาคารประจำวัน", en: "Daily building safety walk",
    dth: "เดินตรวจความปลอดภัยอาคารประจำวัน", den: "Daily building safety walk-through",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["ชั้น/โซน|Floor / zone|text", "ผู้ตรวจ|Inspector|text", "เวลา|Time|datetime"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["ทางหนีไฟโล่ง ไม่ถูกปิด|Fire exits clear|pass_fail", "ไฟฉุกเฉินทำงาน|Emergency lights work|pass_fail", "ไม่มีสายไฟชำรุด/ปลั๊กพ่วงเกิน|No damaged cables / overloaded strips|pass_fail", "ไม่มีน้ำรั่ว/พื้นลื่น|No leaks / slippery floors|pass_fail", "รูปจุดเสี่ยง|Photos of hazards|photo", "การแก้ไข|Action taken|text"] },
    ],
  },
  container_inspection: {
    th: "ตรวจสภาพตู้คอนเทนเนอร์", en: "Container inspection",
    dth: "ตรวจสภาพตู้คอนเทนเนอร์ 7 จุดก่อนบรรจุ/รับคืน พร้อมรูปความเสียหาย", den: "7-point container inspection before stuffing / on return, with damage photos",
    steps: [
      { th: "ข้อมูลตู้", en: "Container", fields: ["เลขตู้|Container no.|barcode", "ขนาด/ประเภท|Size / type|select|20GP,40GP,40HC,20RF,40RF|20GP,40GP,40HC,20RF,40RF", "เลขซีล|Seal no.|text", "ทะเบียนรถหัวลาก|Truck plate|text"] },
      { th: "ตรวจ 7 จุด", en: "7-point check", fields: ["ผนังด้านหน้า/ประตู|Front wall / doors|pass_fail", "ผนังซ้าย-ขวา|Left and right walls|pass_fail", "พื้นตู้|Floor|pass_fail", "หลังคา|Roof|pass_fail", "ใต้ท้องตู้/โครงสร้าง|Undercarriage|pass_fail", "ไม่มีกลิ่น/ความชื้น/รูรั่ว|No odor, moisture or holes|pass_fail", "รูปรอบตู้และจุดเสียหาย|Photos and damage|photo"] },
      { th: "ยืนยัน", en: "Sign-off", fields: ["ผลสรุป|Result|select|ใช้ได้,ใช้ได้มีตำหนิ,ไม่ผ่าน ต้องเปลี่ยนตู้|OK,OK with remarks,Rejected",  "ลายเซ็นผู้ตรวจ|Inspector signature|signature"] },
    ],
  },
  reefer_monitoring: {
    th: "ติดตามอุณหภูมิตู้ Reefer", en: "Reefer monitoring",
    dth: "บันทึกการตรวจตู้คอนเทนเนอร์ห้องเย็น (reefer) ระหว่างรอขึ้นเรือ", den: "Reefer container check log while awaiting loading",
    steps: [
      { th: "ข้อมูลตู้", en: "Container", fields: ["เลขตู้|Container no.|barcode", "อุณหภูมิที่ตั้งไว้|Set point|number|°C|°C", "เวลาตรวจ|Check time|datetime"] },
      { th: "ค่าที่อ่าน", en: "Readings", fields: ["อุณหภูมิลมจ่าย|Supply air temp|number|°C|°C", "อุณหภูมิลมกลับ|Return air temp|number|°C|°C", "เสียบปลั๊กและเครื่องทำงาน|Plugged in and running|pass_fail", "มีสัญญาณเตือน|Alarm present|select|ไม่มี,มี|None,Yes", "รูปหน้าจอควบคุม|Controller display photo|photo"] },
    ],
  },
  dg_cargo_check: {
    th: "ตรวจสินค้าอันตราย (DG)", en: "Dangerous goods check",
    dth: "เช็กลิสต์ตรวจรับ/บรรจุสินค้าอันตราย (DG) ตามเอกสารและป้าย UN", den: "Dangerous goods acceptance / loading checklist against documents and UN labels",
    steps: [
      { th: "ข้อมูลสินค้า", en: "Cargo", fields: ["เลข Booking|Booking no.|barcode", "UN Number|UN number|text", "Class|Class|select|1,2,3,4,5,6,7,8,9|1,2,3,4,5,6,7,8,9", "น้ำหนักรวม|Gross weight|number|กก.|kg"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["เอกสาร DG Declaration/SDS ครบ|DG declaration / SDS present|pass_fail", "ป้าย Placard และฉลาก UN ถูกต้อง|Placards and UN labels correct|pass_fail", "บรรจุภัณฑ์ไม่รั่ว ไม่เสียหาย|Packaging intact, no leaks|pass_fail", "แยกเก็บตามตาราง segregation|Segregation followed|pass_fail", "รูปสินค้าและป้าย|Cargo and label photos|photo", "ลายเซ็นผู้ตรวจ|Inspector signature|signature"] },
    ],
  },
  delivery_pod: {
    th: "หลักฐานการส่งของ (POD)", en: "Proof of delivery",
    dth: "บันทึกการส่งมอบสินค้าให้ลูกค้า พร้อมรูปและลายเซ็นผู้รับ", den: "Proof of delivery with photos and recipient signature",
    steps: [
      { th: "ข้อมูลการส่ง", en: "Delivery", fields: ["เลขที่ใบส่งของ|Delivery note no.|barcode", "ชื่อลูกค้า|Customer|text", "เวลาส่งถึง|Delivered at|datetime"] },
      { th: "ส่งมอบ", en: "Handover", fields: ["จำนวนที่ส่ง|Quantity delivered|number|ชิ้น|pcs", "สภาพสินค้าเมื่อส่งถึง|Condition on arrival|select|สมบูรณ์,เสียหายบางส่วน,ลูกค้าปฏิเสธรับ|Good,Partly damaged,Refused", "รูปสินค้า ณ จุดส่ง|Photo at drop-off|photo", "ชื่อผู้รับ|Received by|text", "ลายเซ็นผู้รับ|Recipient signature|signature"] },
    ],
  },
  customer_complaint: {
    th: "รับเรื่องร้องเรียนลูกค้า", en: "Customer complaint",
    dth: "บันทึกเรื่องร้องเรียนจากลูกค้า การตรวจสอบ และการแก้ไข", den: "Customer complaint intake, investigation and resolution",
    steps: [
      { th: "เรื่องร้องเรียน", en: "Complaint", fields: ["ชื่อลูกค้า|Customer|text", "ช่องทาง|Channel|select|โทรศัพท์,อีเมล,หน้าร้าน,โซเชียล|Phone,Email,In store,Social media", "ประเภท|Category|select|คุณภาพสินค้า,การส่งของ,บริการ,ราคา/บิล,อื่นๆ|Product quality,Delivery,Service,Price/billing,Other", "รายละเอียด|Details|text", "รูป/หลักฐาน|Photos / evidence|photo"] },
      { th: "การแก้ไข", en: "Resolution", fields: ["สาเหตุที่พบ|Root cause|text", "การแก้ไข|Action|select|เปลี่ยนสินค้า,คืนเงิน,ซ่อม,ชี้แจง|Replace,Refund,Repair,Explain", "วันที่ปิดเรื่อง|Closed on|datetime", "ลูกค้าพึงพอใจ|Customer satisfied|pass_fail"] },
    ],
  },
  supplier_audit: {
    th: "ตรวจประเมินผู้ขาย", en: "Supplier audit",
    dth: "ตรวจประเมินผู้ขาย/ผู้รับจ้างช่วง ณ สถานที่ของผู้ขาย พร้อมคะแนน", den: "On-site supplier / subcontractor audit with scoring",
    steps: [
      { th: "ข้อมูลผู้ขาย", en: "Supplier", fields: ["ชื่อผู้ขาย|Supplier|text", "สินค้า/บริการ|Product / service|text", "วันที่ตรวจ|Audit date|datetime"] },
      { th: "หัวข้อประเมิน", en: "Criteria", fields: ["คะแนนรายหัวข้อ|Scores|table|หัวข้อ,คะแนน (1-5),ข้อสังเกต|Criterion,Score (1-5),Notes", "มีใบรับรองมาตรฐาน|Certifications held|checkbox|ISO 9001,ISO 14001,GMP,HACCP|ISO 9001,ISO 14001,GMP,HACCP", "รูปสถานที่ผลิต|Facility photos|photo"] },
      { th: "สรุปผล", en: "Result", fields: ["ผลการประเมิน|Rating|select|อนุมัติ,อนุมัติแบบมีเงื่อนไข,ไม่อนุมัติ|Approved,Conditional,Not approved", "ลายเซ็นผู้ตรวจ|Auditor signature|signature"] },
    ],
  },
  mystery_shopper: {
    th: "แบบประเมิน Mystery Shopper", en: "Mystery shopper",
    dth: "แบบประเมินการบริการหน้าร้านโดยผู้ประเมินแฝง", den: "In-store service evaluation by a mystery shopper",
    steps: [
      { th: "ข้อมูลการเยี่ยม", en: "Visit", fields: ["สาขา|Branch|text", "วันเวลาที่เข้าร้าน|Visit time|datetime", "เวลารอรับบริการ|Wait time|number|นาที|minutes"] },
      { th: "การประเมิน", en: "Evaluation", fields: ["พนักงานทักทายภายใน 30 วินาที|Greeted within 30 seconds|pass_fail", "พนักงานแนะนำสินค้าได้ถูกต้อง|Accurate product advice|pass_fail", "ร้านสะอาดเป็นระเบียบ|Store clean and tidy|pass_fail", "ขั้นตอนชำระเงินถูกต้อง|Checkout done correctly|pass_fail", "ความพึงพอใจโดยรวม|Overall satisfaction|select|ดีมาก,ดี,พอใช้,ควรปรับปรุง|Excellent,Good,Fair,Poor", "รูปใบเสร็จ|Receipt photo|photo", "ความคิดเห็นเพิ่มเติม|Comments|text"] },
    ],
  },
  daily_site_report: {
    th: "รายงานประจำวันหน้างานก่อสร้าง", en: "Daily site report",
    dth: "รายงานความคืบหน้าประจำวันของไซต์ก่อสร้าง: แรงงาน เครื่องจักร สภาพอากาศ", den: "Daily construction site report: labor, equipment, weather, progress",
    steps: [
      { th: "ข้อมูลวัน", en: "Day", fields: ["โครงการ|Project|text", "วันที่|Date|datetime", "สภาพอากาศ|Weather|select|แดด,มีเมฆ,ฝนตก,ฝนตกหนัก หยุดงาน|Sunny,Cloudy,Rain,Heavy rain - stopped"] },
      { th: "ทรัพยากร", en: "Resources", fields: ["แรงงาน|Manpower|table|ประเภทช่าง,จำนวนคน|Trade,Headcount", "เครื่องจักรที่ใช้|Equipment used|table|เครื่องจักร,ชั่วโมงทำงาน|Equipment,Hours"] },
      { th: "ความคืบหน้า", en: "Progress", fields: ["งานที่ทำวันนี้|Work done today|text", "ความคืบหน้ารวม|Overall progress|number|%|%", "ปัญหา/อุปสรรค|Issues / delays|text", "รูปหน้างาน|Site photos|photo", "ลายเซ็นวิศวกรคุมงาน|Site engineer signature|signature"] },
    ],
  },
  haccp_cooking_temp: {
    th: "บันทึกอุณหภูมิปรุง/ทำเย็น (HACCP)", en: "Cooking / cooling log (HACCP)",
    dth: "บันทึกอุณหภูมิการปรุงและการทำให้เย็นตามจุดควบคุมวิกฤต (CCP) ของ HACCP", den: "Cooking and cooling temperature log at HACCP critical control points",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["เมนู/ล็อตอาหาร|Dish / batch|text", "พ่อครัว|Cook|text", "เวลา|Time|datetime"] },
      { th: "อุณหภูมิ", en: "Temperatures", fields: ["อุณหภูมิแกนกลางหลังปรุง|Core temp after cooking|number|°C ยอมรับไม่ต่ำกว่า 75|°C, accepted 75 or above", "อุณหภูมิหลังทำเย็น 2 ชม.|Temp after 2 h cooling|number|°C ยอมรับไม่เกิน 21|°C, accepted up to 21", "อุณหภูมิหลังทำเย็น 6 ชม.|Temp after 6 h cooling|number|°C ยอมรับไม่เกิน 5|°C, accepted up to 5", "การแก้ไขเมื่อค่าไม่ผ่าน|Corrective action|select|ปรุงต่อ,ทิ้ง,ไม่ต้องแก้ไข|Cook longer,Discard,None needed", "ลายเซ็นผู้ตรวจ|Checker signature|signature"] },
    ],
  },
  crash_cart_check: {
    th: "ตรวจรถฉุกเฉิน (Crash cart)", en: "Crash cart check",
    dth: "ตรวจความพร้อมรถอุปกรณ์ช่วยชีวิตฉุกเฉินประจำหอผู้ป่วยทุกวัน", den: "Daily readiness check of the ward emergency crash cart",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["หอผู้ป่วย/แผนก|Ward / unit|select|ER,ICU,อายุรกรรม,ศัลยกรรม,กุมารเวช|ER,ICU,Medical,Surgical,Pediatrics", "รหัสรถ|Cart ID|barcode", "เวลาตรวจ|Check time|datetime"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["ซีลรถไม่ถูกเปิด|Seal intact|pass_fail", "เครื่อง AED/Defibrillator ทดสอบผ่าน|AED / defibrillator test passed|pass_fail", "ถังออกซิเจน|Oxygen cylinder level|number|psi|psi", "อุปกรณ์เปิดทางเดินหายใจครบ|Airway equipment complete|pass_fail", "ยาฉุกเฉินไม่หมดอายุ|Emergency drugs in date|pass_fail", "เลขซีลใหม่|New seal no.|text", "ลายเซ็นพยาบาลผู้ตรวจ|Nurse signature|signature"] },
    ],
  },
  vaccine_fridge: {
    th: "อุณหภูมิตู้เก็บยา/วัคซีน", en: "Vaccine fridge log",
    dth: "บันทึกอุณหภูมิตู้เย็นเก็บยาและวัคซีนวันละ 2 รอบ ค่านอกช่วงต้องแจ้ง", den: "Twice-daily vaccine / medicine fridge temperature log; out of range must be reported",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["ตู้|Fridge|barcode", "รอบ|Round|select|เช้า,บ่าย|Morning,Afternoon", "ผู้บันทึก|Recorded by|text"] },
      { th: "ค่าที่อ่าน", en: "Readings", fields: ["อุณหภูมิปัจจุบัน|Current temp|number|°C ยอมรับ 2-8|°C, accepted 2-8", "อุณหภูมิต่ำสุด|Min temp|number|°C|°C", "อุณหภูมิสูงสุด|Max temp|number|°C|°C", "ประตูปิดสนิท ไม่มีน้ำแข็งเกาะ|Door sealed, no ice build-up|pass_fail", "รูปเทอร์โมมิเตอร์|Thermometer photo|photo", "การแก้ไขเมื่อค่าเกิน|Action if out of range|text"] },
    ],
  },
  hand_hygiene_audit: {
    th: "สังเกตการล้างมือ (5 Moments)", en: "Hand hygiene audit",
    dth: "แบบสังเกตการปฏิบัติล้างมือของบุคลากรตาม 5 Moments ของ WHO", den: "Hand hygiene observation per the WHO 5 Moments",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["หอผู้ป่วย|Ward|text", "ผู้สังเกต|Observer|text", "วันเวลา|Date & time|datetime"] },
      { th: "การสังเกต", en: "Observations", fields: ["บันทึกการสังเกต|Observations|table|กลุ่มบุคลากร,Moment,ล้างมือ (ใช่/ไม่ใช่),วิธี|Staff group,Moment,Performed (Y/N),Method", "จุดเจลแอลกอฮอล์พร้อมใช้|Alcohol rub stations stocked|pass_fail", "อัตราการปฏิบัติ|Compliance rate|number|%|%", "ข้อเสนอแนะ|Feedback|text"] },
    ],
  },
  crop_spray_log: {
    th: "บันทึกการพ่นสารเคมีเกษตร", en: "Crop spray record",
    dth: "บันทึกการใช้สารเคมี/ยาฆ่าแมลงในแปลงเกษตรตามมาตรฐาน GAP", den: "Pesticide / chemical application record per GAP",
    steps: [
      { th: "แปลงและสาร", en: "Plot and product", fields: ["แปลง|Plot|barcode", "พืช|Crop|text", "ชื่อสาร/ยี่ห้อ|Product name|text", "อัตราผสม|Mix rate|number|ซีซี ต่อน้ำ 20 ลิตร|ml per 20 L water", "ศัตรูพืชเป้าหมาย|Target pest|text"] },
      { th: "การพ่น", en: "Application", fields: ["เวลาพ่น|Sprayed at|datetime", "สภาพลม|Wind|select|ลมสงบ,ลมอ่อน,ลมแรง|Calm,Light,Strong", "ระยะปลอดภัยก่อนเก็บเกี่ยว|Pre-harvest interval|number|วัน|days", "ผู้พ่นสวม PPE ครบ|Sprayer wore full PPE|pass_fail", "รูปแปลง|Plot photo|photo", "ลายเซ็นผู้พ่น|Sprayer signature|signature"] },
    ],
  },
  animal_health: {
    th: "ตรวจสุขภาพสัตว์ในฟาร์ม", en: "Livestock health check",
    dth: "บันทึกการตรวจสุขภาพสัตว์ประจำวันในโรงเรือน", den: "Daily livestock health check per house / pen",
    steps: [
      { th: "โรงเรือน", en: "House", fields: ["โรงเรือน/คอก|House / pen|barcode", "ชนิดสัตว์|Species|select|สุกร,ไก่,โคนม,โคเนื้อ|Pigs,Poultry,Dairy cattle,Beef cattle", "จำนวนสัตว์|Head count|number|ตัว|head"] },
      { th: "การตรวจ", en: "Checks", fields: ["อุณหภูมิโรงเรือน|House temperature|number|°C|°C", "สัตว์ป่วย|Sick animals|number|ตัว|head", "สัตว์ตาย|Mortality|number|ตัว|head", "อาการที่พบ|Symptoms seen|checkbox|ไอ,ท้องเสีย,ซึม,ไม่กินอาหาร,ขาเจ็บ|Coughing,Diarrhea,Lethargy,Off feed,Lameness", "น้ำและอาหารเพียงพอ|Water and feed sufficient|pass_fail", "รูปสัตว์ที่มีอาการ|Photos of affected animals|photo"] },
    ],
  },
  harvest_record: {
    th: "บันทึกการเก็บเกี่ยว", en: "Harvest record",
    dth: "บันทึกผลผลิตที่เก็บเกี่ยวแต่ละแปลงเพื่อสอบย้อนกลับ", den: "Harvest yield record per plot for traceability",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["แปลง|Plot|barcode", "พืช/สายพันธุ์|Crop / variety|text", "วันเก็บเกี่ยว|Harvest date|datetime", "หัวหน้าชุดเก็บ|Crew leader|text"] },
      { th: "ผลผลิต", en: "Yield", fields: ["น้ำหนักรวม|Total weight|number|กก.|kg", "เกรด|Grade breakdown|table|เกรด,น้ำหนัก (กก.)|Grade,Weight (kg)", "ผลผลิตเสียหาย|Rejected produce|number|กก.|kg", "รหัสล็อตสำหรับสอบย้อนกลับ|Traceability lot code|text", "รูปผลผลิต|Produce photo|photo"] },
    ],
  },
  solar_inspection: {
    th: "ตรวจระบบโซลาร์เซลล์", en: "Solar PV inspection",
    dth: "ตรวจสภาพและประสิทธิภาพระบบโซลาร์เซลล์บนหลังคา/โซลาร์ฟาร์ม", den: "Rooftop / solar farm PV system inspection",
    steps: [
      { th: "ข้อมูลระบบ", en: "System", fields: ["ไซต์|Site|text", "รหัสอินเวอร์เตอร์|Inverter ID|barcode", "วันเวลา|Date & time|datetime"] },
      { th: "การตรวจ", en: "Checks", fields: ["แผงสะอาด ไม่มีคราบ/เงาบัง|Panels clean, no shading|pass_fail", "แผงไม่แตกร้าว ไม่มี hot spot|No cracks or hot spots|pass_fail", "สายไฟและขั้วต่อแน่น|Cables and connectors secure|pass_fail", "กำลังผลิตขณะตรวจ|Output at inspection|number|kW|kW", "พลังงานสะสมวันนี้|Energy today|number|kWh|kWh", "สถานะอินเวอร์เตอร์|Inverter status|select|ปกติ,มีคำเตือน,หยุดทำงาน|Normal,Warning,Fault", "รูปแผงและอินเวอร์เตอร์|Panel and inverter photos|photo"] },
    ],
  },
  generator_check: {
    th: "ทดสอบเครื่องปั่นไฟสำรอง", en: "Standby generator test",
    dth: "ทดสอบเดินเครื่องกำเนิดไฟฟ้าสำรองประจำสัปดาห์", den: "Weekly standby generator run test",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["เครื่องกำเนิดไฟฟ้า|Generator|barcode", "ช่าง|Technician|text", "วันเวลา|Date & time|datetime"] },
      { th: "ก่อนเดินเครื่อง", en: "Pre-start", fields: ["ระดับน้ำมันเชื้อเพลิง|Fuel level|number|%|%", "น้ำมันเครื่อง/น้ำหล่อเย็น|Oil / coolant|pass_fail", "แรงดันแบตเตอรี่|Battery voltage|number|V|V"] },
      { th: "ขณะเดินเครื่อง", en: "Running", fields: ["แรงดันไฟฟ้าออก|Output voltage|number|V ยอมรับ 380-420|V, accepted 380-420", "ความถี่|Frequency|number|Hz ยอมรับ 49.5-50.5|Hz, accepted 49.5-50.5", "เวลาเดินเครื่อง|Run time|number|นาที|minutes", "ไม่มีเสียง/ควันผิดปกติ|No abnormal noise or smoke|pass_fail", "ลายเซ็นช่าง|Technician signature|signature"] },
    ],
  },
  school_bus_check: {
    th: "ตรวจรถรับส่งนักเรียน", en: "School bus check",
    dth: "ตรวจรถรับส่งนักเรียนก่อนออกและหลังส่ง รวมถึงเช็กว่าไม่มีเด็กตกค้างบนรถ", den: "School bus pre-trip check and end-of-route child check",
    steps: [
      { th: "ข้อมูลรถ", en: "Bus", fields: ["ทะเบียนรถ|License plate|barcode", "คนขับ|Driver|text", "รอบ|Run|select|เช้า,เย็น|Morning,Afternoon"] },
      { th: "ก่อนออกรถ", en: "Pre-trip", fields: ["เข็มขัดนิรภัยทุกที่นั่งใช้ได้|All seat belts work|pass_fail", "ถังดับเพลิงและชุดปฐมพยาบาล|Extinguisher and first-aid kit|pass_fail", "ประตูฉุกเฉินเปิดได้|Emergency exit works|pass_fail", "จำนวนนักเรียนขึ้นรถ|Students boarded|number|คน|students"] },
      { th: "หลังส่งนักเรียน", en: "End of route", fields: ["เดินตรวจทั่วรถแล้ว ไม่มีเด็กตกค้าง|Walked the bus, no child left|pass_fail", "รูปภายในรถหลังตรวจ|Interior photo after check|photo", "ลายเซ็นครูประจำรถ|Bus attendant signature|signature"] },
    ],
  },
  classroom_safety: {
    th: "ตรวจความปลอดภัยห้องเรียน/ห้องแล็บ", en: "Classroom / lab safety",
    dth: "ตรวจความปลอดภัยห้องเรียนและห้องปฏิบัติการประจำเดือน", den: "Monthly classroom and laboratory safety inspection",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["อาคาร/ห้อง|Building / room|text", "ประเภทห้อง|Room type|select|ห้องเรียน,ห้องแล็บวิทยาศาสตร์,ห้องคอมพิวเตอร์,โรงฝึกงาน|Classroom,Science lab,Computer lab,Workshop", "ผู้ตรวจ|Inspector|text"] },
      { th: "รายการตรวจ", en: "Checks", fields: ["ปลั๊กและสายไฟไม่ชำรุด|Outlets and cables OK|pass_fail", "ทางออกฉุกเฉินไม่ถูกปิดกั้น|Exits unobstructed|pass_fail", "ตู้สารเคมีล็อกและมีฉลาก|Chemical cabinet locked and labeled|pass_fail", "ที่ล้างตา/ฝักบัวฉุกเฉินใช้ได้|Eyewash / safety shower works|pass_fail", "ชุดปฐมพยาบาลครบ|First-aid kit complete|pass_fail", "รูปจุดที่ต้องแก้ไข|Photos of issues|photo"] },
    ],
  },
  training_attendance: {
    th: "ลงชื่อเข้าอบรม", en: "Training attendance",
    dth: "ใบลงชื่อเข้าอบรม พร้อมผลทดสอบหลังอบรมและลายเซ็นวิทยากร", den: "Training sign-in sheet with post-test result and trainer signature",
    steps: [
      { th: "หลักสูตร", en: "Course", fields: ["ชื่อหลักสูตร|Course title|text", "วิทยากร|Trainer|text", "วันเวลา|Date & time|datetime", "ชั่วโมงอบรม|Hours|number|ชม.|hrs"] },
      { th: "ผู้เข้าอบรม", en: "Attendees", fields: ["รายชื่อ|Attendees|table|ชื่อ-สกุล,รหัสพนักงาน,แผนก,คะแนนสอบหลังอบรม|Name,Employee ID,Department,Post-test score", "รูปบรรยากาศ|Session photo|photo", "ลายเซ็นวิทยากร|Trainer signature|signature"] },
    ],
  },
  field_service_report: {
    th: "ใบงานช่างบริการนอกสถานที่", en: "Field service report",
    dth: "ใบงานช่างบริการที่บ้าน/ไซต์ลูกค้า บันทึกงานที่ทำ อะไหล่ และลายเซ็นลูกค้า", den: "Technician job sheet at the customer site: work done, parts and customer sign-off",
    steps: [
      { th: "งาน", en: "Job", fields: ["เลขที่ใบงาน|Job no.|barcode", "ชื่อลูกค้า/สถานที่|Customer / site|text", "ประเภทงาน|Job type|select|ติดตั้ง,ซ่อม,บำรุงรักษา,ตรวจเช็ก|Installation,Repair,Maintenance,Inspection", "เวลาถึง-เสร็จ|Arrival - finish|datetime"] },
      { th: "รายละเอียดงาน", en: "Work", fields: ["อาการ/ปัญหาที่แจ้ง|Reported problem|text", "งานที่ทำ|Work performed|text", "อะไหล่ที่ใช้|Parts used|table|อะไหล่,จำนวน,ราคา|Part,Qty,Price", "รูปก่อน-หลังทำงาน|Before / after photos|photo"] },
      { th: "ปิดงาน", en: "Close-out", fields: ["สถานะ|Status|select|เสร็จเรียบร้อย,ต้องกลับมาอีกครั้ง,รออะไหล่|Completed,Follow-up needed,Waiting for parts", "ลายเซ็นลูกค้า|Customer signature|signature", "ลายเซ็นช่าง|Technician signature|signature"] },
    ],
  },
  installation_handover: {
    th: "ส่งมอบงานติดตั้ง", en: "Installation handover",
    dth: "ใบส่งมอบงานติดตั้งอุปกรณ์ (เช่น แอร์ กล้อง CCTV อินเทอร์เน็ต) พร้อมทดสอบต่อหน้าลูกค้า", den: "Installation handover (e.g. AC, CCTV, internet) with tests witnessed by the customer",
    steps: [
      { th: "ข้อมูล", en: "Info", fields: ["ลูกค้า|Customer|text", "อุปกรณ์ที่ติดตั้ง|Equipment installed|text", "Serial number|Serial number|barcode", "ทีมติดตั้ง|Install team|text"] },
      { th: "ทดสอบ", en: "Tests", fields: ["อุปกรณ์ทำงานครบทุกฟังก์ชัน|All functions working|pass_fail", "เก็บงานสายไฟเรียบร้อย|Cabling tidy|pass_fail", "ทำความสะอาดพื้นที่หลังติดตั้ง|Area cleaned up|pass_fail", "อธิบายการใช้งานให้ลูกค้าแล้ว|Customer briefed on use|pass_fail", "รูปงานติดตั้ง|Installation photos|photo"] },
      { th: "รับมอบ", en: "Acceptance", fields: ["ความพึงพอใจ|Satisfaction|select|พอใจมาก,พอใจ,ไม่พอใจ|Very satisfied,Satisfied,Unsatisfied", "ลายเซ็นลูกค้า|Customer signature|signature"] },
    ],
  },
  site_survey: {
    th: "สำรวจหน้างานก่อนเสนอราคา", en: "Site survey",
    dth: "แบบสำรวจหน้างานก่อนเสนอราคา/ออกแบบ บันทึกขนาด ข้อจำกัด และรูป", den: "Pre-quote site survey: measurements, constraints and photos",
    steps: [
      { th: "ข้อมูลลูกค้า", en: "Customer", fields: ["ชื่อลูกค้า|Customer|text", "ที่อยู่ไซต์|Site address|text", "ผู้สำรวจ|Surveyor|text", "วันที่สำรวจ|Survey date|datetime"] },
      { th: "หน้างาน", en: "Site", fields: ["ขนาดพื้นที่|Measurements|table|จุด,กว้าง (ม.),ยาว (ม.),สูง (ม.)|Area,Width (m),Length (m),Height (m)", "แหล่งไฟฟ้าที่มี|Power available|select|220V,380V,ไม่มี|220V,380V,None", "ข้อจำกัดการเข้าพื้นที่|Access constraints|checkbox|ต้องใช้รถเครน,เข้าได้เฉพาะกลางคืน,ต้องขออนุญาตนิติ,พื้นที่แคบ|Crane needed,Night access only,Building permit needed,Tight space", "รูปหน้างาน|Site photos|photo", "ความต้องการของลูกค้า|Customer requirements|text"] },
    ],
  },
  security_patrol: {
    th: "เดินตรวจรักษาความปลอดภัย", en: "Security patrol",
    dth: "บันทึกการเดินตรวจของ รปภ. ตามจุดตรวจ สแกน QR แต่ละจุด", den: "Security guard patrol log, scanning the QR at each checkpoint",
    steps: [
      { th: "รอบตรวจ", en: "Round", fields: ["ชื่อ รปภ.|Guard name|text", "รอบ|Round|select|22:00,00:00,02:00,04:00|22:00,00:00,02:00,04:00", "จุดตรวจ|Checkpoint|barcode|สแกน QR ที่จุดตรวจ|scan the checkpoint QR"] },
      { th: "การตรวจ", en: "Checks", fields: ["ประตู/หน้าต่างล็อก|Doors and windows locked|pass_fail", "ไฟส่องสว่างทำงาน|Lighting working|pass_fail", "ไม่พบบุคคล/รถแปลกปลอม|No unknown persons or vehicles|pass_fail", "กล้อง CCTV ทำงาน|CCTV working|pass_fail", "รูป ณ จุดตรวจ|Checkpoint photo|photo", "เหตุการณ์ที่พบ|Observations|text"] },
    ],
  },
};

const g = (key: string, th: string, en: string, ids: string[]): PromptGroup => ({
  key, th, en,
  items: ids.map((id) => ({ id, th: SPECS[id].th, en: SPECS[id].en })),
});

// ---------- แบ่งตามลักษณะงาน ----------
// ไม่ซ้ำกับคลังเทมเพลต (ตรวจเครื่องจักรก่อนกะ, ความปลอดภัยประจำวัน, รับสินค้า, เบิกวัสดุ, QC, 5ส, ทำความสะอาดเครื่อง, อุบัติการณ์)
export const PROMPTS_BY_TASK: PromptGroup[] = [
  g("inspect", "ตรวจสภาพ/ก่อนใช้งาน", "Pre-use inspection", ["forklift", "vehicle_pretrip", "container_inspection", "scaffold"]),
  g("log", "บันทึกค่า/ตรวจวัด", "Readings / Logging", ["coldroom_temp", "meter_reading", "machine_params", "generator_check"]),
  g("quality", "คุณภาพ/ข้อร้องเรียน", "Quality / Complaints", ["iqc", "ncr", "customer_complaint", "supplier_audit"]),
  g("safety", "ความปลอดภัย/ใบอนุญาต", "Safety / Permits", ["permit_to_work", "site_ppe", "fire_ext", "security_patrol"]),
  g("maintenance", "ซ่อมบำรุง", "Maintenance", ["repair_request", "pm", "building_systems", "solar_inspection"]),
  g("field", "งานบริการภาคสนาม", "Field service", ["field_service_report", "installation_handover", "site_survey", "delivery_pod"]),
  g("people", "คน/เข้า-ออก/อบรม", "People / Access / Training", ["visitor", "contractor_checkin", "training_attendance"]),
  g("audit", "ตรวจประเมิน/ร้านค้า", "Audits / Stores", ["store_openclose", "shelf_check", "cycle_count", "mystery_shopper", "hand_hygiene_audit"]),
];

// ---------- แบ่งตามอุตสาหกรรม ----------
export const PROMPTS_BY_INDUSTRY: PromptGroup[] = [
  g("logistics", "ขนส่ง/โลจิสติกส์", "Transport / Logistics", ["vehicle_pretrip", "fuel_log", "post_trip", "delivery_pod"]),
  g("port", "ท่าเรือ/ตู้คอนเทนเนอร์", "Port / Containers", ["container_inspection", "reefer_monitoring", "dg_cargo_check"]),
  g("construction", "ก่อสร้าง", "Construction", ["daily_site_report", "site_ppe", "scaffold", "permit_to_work"]),
  g("food", "อาหาร/ร้านอาหาร", "Food / Restaurants", ["gmp_kitchen", "haccp_cooking_temp", "ingredient_receiving"]),
  g("retail", "ค้าปลีก/ร้านค้า", "Retail", ["store_openclose", "shelf_check", "mystery_shopper", "storefront_clean"]),
  g("hospitality", "โรงแรม/บริการ", "Hospitality", ["room_housekeeping", "common_area", "meeting_room"]),
  g("healthcare", "โรงพยาบาล/คลินิก", "Healthcare", ["crash_cart_check", "vaccine_fridge", "hand_hygiene_audit"]),
  g("agriculture", "เกษตร/ปศุสัตว์", "Agriculture / Livestock", ["crop_spray_log", "animal_health", "harvest_record"]),
  g("energy", "พลังงาน/สาธารณูปโภค", "Energy / Utilities", ["solar_inspection", "generator_check", "meter_reading"]),
  g("facilities", "อาคาร/นิติบุคคล", "Facilities / Property", ["fire_ext", "building_systems", "building_walk", "security_patrol"]),
  g("education", "โรงเรียน/การศึกษา", "Education", ["school_bus_check", "classroom_safety", "training_attendance"]),
  g("field", "ติดตั้ง/บริการนอกสถานที่", "Installation / Field service", ["field_service_report", "installation_handover", "site_survey"]),
  g("manufacturing", "โรงงานผลิต", "Manufacturing", ["machine_params", "ncr", "pm", "iqc"]),
];

// ---------- แปลงเป็นคำสั่งเต็มสำหรับ AI ----------
const TYPE_WORD: Record<PromptFieldType, { th: string; en: string }> = {
  text: { th: "ข้อความ", en: "text" },
  number: { th: "ตัวเลข", en: "number" },
  select: { th: "เลือก 1 ข้อ", en: "single choice" },
  checkbox: { th: "เลือกได้หลายข้อ", en: "multiple choice" },
  pass_fail: { th: "ผ่าน/ไม่ผ่าน", en: "pass/fail" },
  photo: { th: "รูปถ่าย", en: "photo" },
  barcode: { th: "สแกน QR/บาร์โค้ด", en: "QR/barcode scan" },
  signature: { th: "ลายเซ็น", en: "signature" },
  datetime: { th: "วันเวลา", en: "date & time" },
  table: { th: "ตาราง", en: "table" },
};

export interface ParsedField { label: string; type: PromptFieldType; extra?: string }

export function parseField(raw: string, lang: Lang): ParsedField {
  const [th, en, type, xth, xen] = raw.split("|");
  if (!PROMPT_FIELD_TYPES.includes(type as PromptFieldType)) throw new Error(`ชนิดฟิลด์ไม่รู้จัก: ${raw}`);
  const extra = lang === "en" ? xen ?? xth : xth;
  return { label: lang === "en" ? en || th : th, type: type as PromptFieldType, extra: extra || undefined };
}

function fieldLine(f: ParsedField, lang: Lang): string {
  const w = TYPE_WORD[f.type][lang];
  if (!f.extra) return `- ${f.label} (${w})`;
  const sep = lang === "en" ? ", " : ", ";
  if (f.type === "select" || f.type === "checkbox") return `- ${f.label} (${w}: ${f.extra.split(",").join(sep)})`;
  if (f.type === "table") return `- ${f.label} (${w} ${lang === "en" ? "columns" : "คอลัมน์"}: ${f.extra.split(",").join(sep)})`;
  return `- ${f.label} (${w}, ${f.extra})`;
}

/** คำสั่งเต็มของตัวอย่าง id — ชื่อ + รายละเอียด + ขั้นตอนและฟิลด์ (ใช้เติมช่อง prompt) */
export function buildPrompt(id: string, lang: Lang): string {
  const s = SPECS[id];
  if (!s) return "";
  const en = lang === "en";
  const lines = [
    `${en ? "Form" : "ฟอร์ม"}: ${en ? s.en : s.th}`,
    en ? s.den : s.dth,
    "",
    en ? "Steps and fields:" : "ขั้นตอนและฟิลด์:",
  ];
  s.steps.forEach((st, i) => {
    lines.push(`${en ? "Step" : "ขั้นที่"} ${i + 1}: ${en ? st.en : st.th}`);
    for (const f of st.fields) lines.push(fieldLine(parseField(f, lang), lang));
  });
  return lines.join("\n");
}

/** สำหรับทดสอบ: id ทั้งหมดในคลัง */
export const PROMPT_IDS = Object.keys(SPECS);
