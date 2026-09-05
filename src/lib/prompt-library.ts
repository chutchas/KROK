// คลังตัวอย่าง prompt สำหรับสร้างฟอร์มด้วย AI — แบ่ง 2 แบบ: ตามลักษณะงาน / ตามอุตสาหกรรม
export interface PromptItem { th: string; en: string }
export interface PromptGroup { key: string; th: string; en: string; items: PromptItem[] }

// ---------- แบ่งตามลักษณะงาน ----------
export const PROMPTS_BY_TASK: PromptGroup[] = [
  {
    key: "inspect", th: "ตรวจสอบ/ตรวจเช็ก", en: "Inspection",
    items: [
      { th: "ใบตรวจสภาพ forklift ก่อนใช้งานประจำวัน สแกน QR ประจำรถ ตรวจยาง เบรก ไฟเตือน และถ่ายรูปสภาพรถ", en: "Daily forklift pre-use inspection: scan the unit QR, check tires, brakes, warning lights, and take a photo" },
      { th: "ตรวจความปลอดภัยเครื่องจักรก่อนเริ่มกะ (LOTO, การ์ดกันอันตราย, ปุ่มหยุดฉุกเฉิน)", en: "Machine pre-shift safety check (LOTO, guards, emergency stop)" },
      { th: "ตรวจเช็กรถขนส่งก่อนออกวิ่ง (น้ำมัน ลมยาง ไฟ เอกสาร)", en: "Vehicle pre-trip check (fuel, tire pressure, lights, documents)" },
    ],
  },
  {
    key: "checklist", th: "เช็คลิสต์/ความสะอาด", en: "Checklist / 5S",
    items: [
      { th: "ใบตรวจความสะอาด 5ส ประจำสัปดาห์ แยกตามโซน", en: "Weekly 5S cleanliness checklist, split by zone" },
      { th: "เช็กลิสต์เปิด-ปิดร้านประจำวัน", en: "Daily open/close store checklist" },
      { th: "ตรวจสุขลักษณะครัว/พื้นที่ผลิตอาหารตามหลัก GMP", en: "Kitchen/food-area hygiene check (GMP)" },
    ],
  },
  {
    key: "log", th: "บันทึกค่า/ตรวจวัด", en: "Readings / Logging",
    items: [
      { th: "ใบบันทึกอุณหภูมิห้องเย็นรายชั่วโมง มีช่วงที่ยอมรับและแจ้งเตือนเมื่อเกิน", en: "Hourly cold-room temperature log with accepted range and out-of-range alert" },
      { th: "บันทึกค่ามิเตอร์น้ำ/ไฟ/ลม ประจำวัน", en: "Daily water/electric/air meter readings" },
      { th: "บันทึกพารามิเตอร์เครื่องจักรทุกกะ", en: "Per-shift machine parameter log" },
    ],
  },
  {
    key: "qc", th: "QC/คุณภาพ", en: "Quality (QC)",
    items: [
      { th: "QC ตรวจชิ้นงานแรก (first piece) พร้อมค่าที่วัดได้และรูปถ่าย", en: "First-piece QC with measured values and photos" },
      { th: "ใบตรวจรับคุณภาพวัตถุดิบเข้า (IQC)", en: "Incoming material quality check (IQC)" },
      { th: "บันทึกของเสีย/ของไม่ผ่าน (NCR) พร้อมสาเหตุและรูป", en: "Non-conformance report (NCR) with cause and photo" },
    ],
  },
  {
    key: "logistics", th: "รับ-ส่ง/คลังสินค้า", en: "Logistics / Warehouse",
    items: [
      { th: "ใบตรวจรับสินค้าเข้าคลัง เทียบ PO และถ่ายรูปพาเลท", en: "Goods-receiving check against PO with pallet photo" },
      { th: "ใบเบิก-จ่ายสินค้าออกจากคลัง", en: "Stock issue/withdrawal form" },
      { th: "ตรวจนับสต็อกรอบ (cycle count)", en: "Cycle count sheet" },
    ],
  },
  {
    key: "access", th: "เข้า-ออก/ความปลอดภัยบุคคล", en: "Access / People safety",
    items: [
      { th: "check-in ผู้รับเหมาเข้าพื้นที่โรงงาน (บัตร, PPE, ความปลอดภัย)", en: "Contractor site check-in (ID, PPE, safety briefing)" },
      { th: "ลงทะเบียนผู้มาติดต่อ (visitor)", en: "Visitor registration" },
      { th: "Permit to work งานเสี่ยง (งานร้อน ที่อับอากาศ ที่สูง)", en: "Permit to work for high-risk jobs (hot work, confined space, height)" },
    ],
  },
  {
    key: "maintenance", th: "บำรุงรักษา", en: "Maintenance",
    items: [
      { th: "ใบแจ้งซ่อม/แจ้งปัญหาเครื่องจักร พร้อมรูป", en: "Machine breakdown/repair request with photo" },
      { th: "PM บำรุงรักษาเชิงป้องกันตามรอบ", en: "Preventive maintenance (PM) checklist" },
      { th: "ตรวจถังดับเพลิง/ระบบดับเพลิงประจำเดือน", en: "Monthly fire extinguisher / fire-system check" },
    ],
  },
];

// ---------- แบ่งตามอุตสาหกรรม ----------
export const PROMPTS_BY_INDUSTRY: PromptGroup[] = [
  {
    key: "manufacturing", th: "โรงงานผลิต", en: "Manufacturing",
    items: [
      { th: "QC ตรวจชิ้นงานแรกก่อนเดินไลน์ พร้อมค่าที่วัดและรูป", en: "First-piece QC before running the line, with measurements and photos" },
      { th: "ตรวจความปลอดภัยเครื่องจักรก่อนเริ่มกะ", en: "Machine pre-shift safety check" },
      { th: "บันทึกพารามิเตอร์การผลิตทุกชั่วโมง", en: "Hourly production parameter log" },
    ],
  },
  {
    key: "warehouse", th: "คลังสินค้า/โลจิสติกส์", en: "Warehouse / Logistics",
    items: [
      { th: "ใบตรวจรับสินค้าเข้าคลัง เทียบ PO และถ่ายรูป", en: "Goods-receiving check vs PO with photo" },
      { th: "ตรวจนับสต็อกรอบ (cycle count)", en: "Cycle count" },
      { th: "ตรวจสภาพ forklift ก่อนใช้งาน", en: "Forklift pre-use inspection" },
    ],
  },
  {
    key: "construction", th: "ก่อสร้าง", en: "Construction",
    items: [
      { th: "Permit to work งานเสี่ยงในไซต์", en: "Permit to work for high-risk site jobs" },
      { th: "ตรวจ PPE และความปลอดภัยก่อนเข้าไซต์", en: "PPE and safety check before entering site" },
      { th: "ตรวจนั่งร้าน/scaffold ก่อนใช้งาน", en: "Scaffold pre-use inspection" },
    ],
  },
  {
    key: "food", th: "อาหาร/ครัว", en: "Food / F&B",
    items: [
      { th: "ตรวจสุขลักษณะครัวตามหลัก GMP", en: "Kitchen hygiene check (GMP)" },
      { th: "บันทึกอุณหภูมิตู้เย็น/ตู้แช่รายชั่วโมง", en: "Hourly fridge/freezer temperature log" },
      { th: "ใบตรวจรับวัตถุดิบเข้าครัว", en: "Ingredient receiving check" },
    ],
  },
  {
    key: "retail", th: "ค้าปลีก/ร้านค้า", en: "Retail",
    items: [
      { th: "เช็กลิสต์เปิด-ปิดร้านประจำวัน", en: "Daily open/close checklist" },
      { th: "ตรวจสต็อกและป้ายราคาบนชั้นวาง", en: "Shelf stock and price-tag check" },
      { th: "ตรวจความสะอาดและความเรียบร้อยหน้าร้าน", en: "Storefront cleanliness and tidiness check" },
    ],
  },
  {
    key: "hospitality", th: "โรงแรม/บริการ", en: "Hospitality",
    items: [
      { th: "ตรวจความสะอาดห้องพัก (housekeeping)", en: "Guest-room cleaning check (housekeeping)" },
      { th: "ตรวจพื้นที่ส่วนกลางและสิ่งอำนวยความสะดวก", en: "Common-area and facilities check" },
      { th: "เช็กอุปกรณ์ในห้องประชุมก่อนใช้งาน", en: "Meeting-room equipment pre-use check" },
    ],
  },
  {
    key: "fleet", th: "ขนส่ง/ฟลีต", en: "Transport / Fleet",
    items: [
      { th: "ตรวจรถก่อนออกวิ่ง (pre-trip)", en: "Vehicle pre-trip inspection" },
      { th: "บันทึกเลขไมล์และการเติมน้ำมัน", en: "Odometer and refueling log" },
      { th: "ตรวจสภาพรถหลังกลับเข้าอู่ (post-trip)", en: "Post-trip vehicle check" },
    ],
  },
  {
    key: "facilities", th: "อาคาร/สิ่งอำนวยความสะดวก", en: "Facilities",
    items: [
      { th: "ตรวจระบบดับเพลิงและถังดับเพลิงประจำเดือน", en: "Monthly fire-system and extinguisher check" },
      { th: "ตรวจลิฟต์/ระบบไฟฟ้า/ปั๊มน้ำ", en: "Elevator / electrical / water-pump check" },
      { th: "ตรวจความปลอดภัยอาคารประจำวัน", en: "Daily building safety walk" },
    ],
  },
];
