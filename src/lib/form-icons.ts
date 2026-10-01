// ============================================================
// KROK · ไอคอนฟอร์ม (ชุดไอคอนเส้นแบบคลีน — lucide)
//
// เก็บในช่องเดิม (forms.icon / schema.icon / submissions.form_icon) เป็นรหัส "i:<ชื่อ>" เช่น "i:package"
// ข้อมูลเก่าที่เป็นอีโมจิ → แปลงเป็นไอคอนที่ใกล้เคียงตอนแสดงผล (resolveIconKey) ไม่ต้องแก้ข้อมูลในฐานข้อมูล
// ไฟล์นี้ไม่มี React — ใช้ได้ทั้ง server/client · ตัววาดไอคอนอยู่ที่ components/FormIcon.tsx
// ============================================================

export interface IconDef { key: string; th: string; en: string }
export interface IconGroup { key: string; kind: "task" | "industry"; th: string; en: string; icons: string[] }

/** ชื่อไอคอน (ใช้ค้นหา/tooltip) — key ต้องตรงกับ ICON_COMPONENTS ใน FormIcon.tsx */
export const ICONS: IconDef[] = [
  { key: "clipboard-list", th: "รายการตรวจ", en: "Checklist" },
  { key: "clipboard-check", th: "ตรวจผ่าน", en: "Inspection" },
  { key: "list-checks", th: "เช็กลิสต์", en: "List checks" },
  { key: "search-check", th: "ตรวจสอบ", en: "Audit" },
  { key: "scan-line", th: "สแกน", en: "Scan" },
  { key: "eye", th: "สังเกต", en: "Observe" },
  { key: "shield-check", th: "ความปลอดภัย", en: "Safety" },
  { key: "hard-hat", th: "หมวกนิรภัย", en: "Hard hat" },
  { key: "triangle-alert", th: "อันตราย/เหตุผิดปกติ", en: "Hazard" },
  { key: "flame", th: "ไฟ/งานร้อน", en: "Fire" },
  { key: "siren", th: "ฉุกเฉิน", en: "Emergency" },
  { key: "heart-pulse", th: "ปฐมพยาบาล/สุขภาพ", en: "Health" },
  { key: "badge-check", th: "คุณภาพ", en: "Quality" },
  { key: "microscope", th: "ห้องแล็บ/QC", en: "Lab" },
  { key: "ruler", th: "วัดขนาด", en: "Measure" },
  { key: "gauge", th: "มาตรวัด", en: "Gauge" },
  { key: "target", th: "เป้าหมาย", en: "Target" },
  { key: "scale", th: "ชั่งน้ำหนัก", en: "Scale" },
  { key: "wrench", th: "ซ่อมบำรุง", en: "Maintenance" },
  { key: "cog", th: "เครื่องจักร", en: "Machine" },
  { key: "hammer", th: "ช่าง", en: "Hammer" },
  { key: "drill", th: "สว่าน/เครื่องมือ", en: "Tools" },
  { key: "plug-zap", th: "ไฟฟ้า", en: "Electrical" },
  { key: "fan", th: "แอร์/ระบายอากาศ", en: "HVAC" },
  { key: "package", th: "พัสดุ/สินค้า", en: "Package" },
  { key: "package-check", th: "รับสินค้า", en: "Goods received" },
  { key: "boxes", th: "สต็อก", en: "Stock" },
  { key: "warehouse", th: "คลังสินค้า", en: "Warehouse" },
  { key: "forklift", th: "รถยก", en: "Forklift" },
  { key: "truck", th: "รถบรรทุก/ขนส่ง", en: "Truck" },
  { key: "car", th: "รถยนต์", en: "Car" },
  { key: "route", th: "เส้นทาง", en: "Route" },
  { key: "container", th: "ตู้คอนเทนเนอร์", en: "Container" },
  { key: "barcode", th: "บาร์โค้ด", en: "Barcode" },
  { key: "factory", th: "โรงงาน", en: "Factory" },
  { key: "layers", th: "ไลน์ผลิต", en: "Production" },
  { key: "workflow", th: "ขั้นตอนงาน", en: "Workflow" },
  { key: "timer", th: "เวลา/รอบ", en: "Timer" },
  { key: "cpu", th: "อิเล็กทรอนิกส์", en: "Electronics" },
  { key: "users", th: "ทีม/บุคคล", en: "People" },
  { key: "user-check", th: "เข้างาน/ตรวจคน", en: "Check-in" },
  { key: "id-card", th: "บัตร/ผู้มาติดต่อ", en: "ID card" },
  { key: "calendar-days", th: "ลา/ตารางงาน", en: "Calendar" },
  { key: "graduation-cap", th: "อบรม", en: "Training" },
  { key: "sparkles", th: "ความสะอาด/5ส", en: "Clean" },
  { key: "spray-can", th: "ฆ่าเชื้อ", en: "Sanitize" },
  { key: "trash-2", th: "ขยะ", en: "Waste" },
  { key: "recycle", th: "รีไซเคิล", en: "Recycle" },
  { key: "thermometer", th: "อุณหภูมิ", en: "Temperature" },
  { key: "snowflake", th: "ห้องเย็น", en: "Cold" },
  { key: "droplets", th: "น้ำ/ความชื้น", en: "Water" },
  { key: "activity", th: "ค่าที่วัด", en: "Readings" },
  { key: "zap", th: "พลังงาน", en: "Energy" },
  { key: "chart-line", th: "กราฟ/บันทึกค่า", en: "Log" },
  { key: "file-text", th: "เอกสาร", en: "Document" },
  { key: "receipt", th: "ใบเสร็จ/การเงิน", en: "Receipt" },
  { key: "calculator", th: "คำนวณ", en: "Calculator" },
  { key: "shopping-cart", th: "จัดซื้อ", en: "Purchase" },
  { key: "signature", th: "ลงนาม", en: "Signature" },
  { key: "mail", th: "จดหมาย", en: "Mail" },
  { key: "handshake", th: "ลูกค้า/คู่ค้า", en: "Partner" },
  { key: "headset", th: "บริการลูกค้า", en: "Support" },
  { key: "camera", th: "ถ่ายรูป", en: "Camera" },
  { key: "key-round", th: "กุญแจ", en: "Key" },
  { key: "construction", th: "ก่อสร้าง", en: "Construction" },
  { key: "building-2", th: "อาคาร", en: "Building" },
  { key: "brick-wall", th: "งานโครงสร้าง", en: "Structure" },
  { key: "utensils", th: "ร้านอาหาร", en: "Restaurant" },
  { key: "chef-hat", th: "ครัว", en: "Kitchen" },
  { key: "cooking-pot", th: "ปรุงอาหาร", en: "Cooking" },
  { key: "apple", th: "วัตถุดิบอาหาร", en: "Produce" },
  { key: "store", th: "ร้านค้า", en: "Store" },
  { key: "shopping-bag", th: "ค้าปลีก", en: "Retail" },
  { key: "tag", th: "ป้ายราคา", en: "Price tag" },
  { key: "banknote", th: "เงินสด", en: "Cash" },
  { key: "hotel", th: "โรงแรม", en: "Hotel" },
  { key: "bed-double", th: "ห้องพัก", en: "Room" },
  { key: "concierge-bell", th: "บริการ", en: "Service" },
  { key: "waves", th: "สระว่ายน้ำ", en: "Pool" },
  { key: "stethoscope", th: "โรงพยาบาล/คลินิก", en: "Clinic" },
  { key: "hospital", th: "โรงพยาบาล", en: "Hospital" },
  { key: "pill", th: "ยา", en: "Medicine" },
  { key: "syringe", th: "วัคซีน", en: "Vaccine" },
  { key: "flask-conical", th: "สารเคมี", en: "Chemical" },
  { key: "sprout", th: "เพาะปลูก", en: "Crop" },
  { key: "tractor", th: "ฟาร์ม", en: "Farm" },
  { key: "wheat", th: "เก็บเกี่ยว", en: "Harvest" },
  { key: "leaf", th: "สิ่งแวดล้อม", en: "Environment" },
  { key: "sun", th: "โซลาร์เซลล์", en: "Solar" },
  { key: "battery-charging", th: "แบตเตอรี่", en: "Battery" },
  { key: "fuel", th: "น้ำมัน", en: "Fuel" },
  { key: "ship", th: "เรือ/ท่าเรือ", en: "Ship" },
  { key: "anchor", th: "ท่าเรือ", en: "Port" },
  { key: "plane", th: "สนามบิน", en: "Airport" },
  { key: "school", th: "โรงเรียน", en: "School" },
  { key: "book-open", th: "การศึกษา", en: "Education" },
  { key: "bus", th: "รถรับส่ง", en: "Bus" },
  { key: "laptop", th: "ไอที", en: "IT" },
  { key: "wifi", th: "เครือข่าย", en: "Network" },
  { key: "map-pin", th: "สถานที่/ไซต์", en: "Location" },
  { key: "lightbulb", th: "ไอเดีย/ไฟส่องสว่าง", en: "Lighting" },
];

export const ICON_GROUPS: IconGroup[] = [
  // ---- ลักษณะงาน ----
  { key: "inspection", kind: "task", th: "ตรวจสอบ", en: "Inspection", icons: ["clipboard-check", "clipboard-list", "list-checks", "search-check", "scan-line", "eye", "camera"] },
  { key: "safety", kind: "task", th: "ความปลอดภัย", en: "Safety", icons: ["shield-check", "hard-hat", "triangle-alert", "flame", "siren", "heart-pulse", "key-round"] },
  { key: "quality", kind: "task", th: "คุณภาพ", en: "Quality", icons: ["badge-check", "microscope", "ruler", "gauge", "target", "scale", "flask-conical"] },
  { key: "maintenance", kind: "task", th: "ซ่อมบำรุง", en: "Maintenance", icons: ["wrench", "cog", "hammer", "drill", "plug-zap", "fan", "lightbulb"] },
  { key: "logistics", kind: "task", th: "คลัง/ขนส่ง", en: "Logistics", icons: ["package", "package-check", "boxes", "warehouse", "forklift", "truck", "car", "route", "container", "barcode"] },
  { key: "production", kind: "task", th: "การผลิต", en: "Production", icons: ["factory", "layers", "workflow", "timer", "cpu"] },
  { key: "readings", kind: "task", th: "บันทึกค่า", en: "Readings", icons: ["thermometer", "snowflake", "droplets", "activity", "zap", "chart-line"] },
  { key: "clean", kind: "task", th: "ความสะอาด", en: "Cleaning", icons: ["sparkles", "spray-can", "trash-2", "recycle", "leaf"] },
  { key: "people", kind: "task", th: "บุคคล/เข้างาน", en: "People", icons: ["users", "user-check", "id-card", "calendar-days", "graduation-cap"] },
  { key: "office", kind: "task", th: "เอกสาร/สำนักงาน", en: "Office", icons: ["file-text", "receipt", "calculator", "shopping-cart", "signature", "mail", "handshake", "headset"] },
  // ---- อุตสาหกรรม ----
  { key: "manufacturing", kind: "industry", th: "โรงงานผลิต", en: "Manufacturing", icons: ["factory", "cog", "layers", "cpu", "gauge", "wrench"] },
  { key: "ind-logistics", kind: "industry", th: "ขนส่ง/คลังสินค้า", en: "Transport / Warehouse", icons: ["truck", "warehouse", "forklift", "boxes", "package", "route", "fuel"] },
  { key: "port", kind: "industry", th: "ท่าเรือ/ตู้คอนเทนเนอร์", en: "Port / Containers", icons: ["ship", "anchor", "container", "plane"] },
  { key: "construction", kind: "industry", th: "ก่อสร้าง", en: "Construction", icons: ["construction", "hard-hat", "building-2", "brick-wall", "drill", "ruler"] },
  { key: "food", kind: "industry", th: "อาหาร/ร้านอาหาร", en: "Food", icons: ["utensils", "chef-hat", "cooking-pot", "apple", "thermometer", "snowflake"] },
  { key: "retail", kind: "industry", th: "ค้าปลีก/ร้านค้า", en: "Retail", icons: ["store", "shopping-bag", "tag", "banknote", "barcode", "shopping-cart"] },
  { key: "hospitality", kind: "industry", th: "โรงแรม/บริการ", en: "Hospitality", icons: ["hotel", "bed-double", "concierge-bell", "waves", "sparkles"] },
  { key: "healthcare", kind: "industry", th: "โรงพยาบาล/คลินิก", en: "Healthcare", icons: ["stethoscope", "hospital", "pill", "syringe", "heart-pulse", "flask-conical"] },
  { key: "agriculture", kind: "industry", th: "เกษตร/ปศุสัตว์", en: "Agriculture", icons: ["sprout", "tractor", "wheat", "leaf", "droplets"] },
  { key: "energy", kind: "industry", th: "พลังงาน/สาธารณูปโภค", en: "Energy", icons: ["sun", "zap", "battery-charging", "plug-zap", "fuel"] },
  { key: "facilities", kind: "industry", th: "อาคาร/นิติบุคคล", en: "Facilities", icons: ["building-2", "key-round", "lightbulb", "fan", "map-pin"] },
  { key: "education", kind: "industry", th: "โรงเรียน/การศึกษา", en: "Education", icons: ["school", "book-open", "bus", "graduation-cap"] },
  { key: "it", kind: "industry", th: "ไอที/บริการภาคสนาม", en: "IT / Field service", icons: ["laptop", "wifi", "headset", "map-pin", "wrench"] },
];

export const DEFAULT_ICON = "i:clipboard-list";
const KEYS = new Set(ICONS.map((i) => i.key));
const DEF = new Map(ICONS.map((i) => [i.key, i]));

/** อีโมจิเก่า (ฟอร์มเดิม/เทมเพลต/AI) → ไอคอนที่ใกล้เคียง */
const LEGACY: Record<string, string> = {
  "📋": "clipboard-list", "📝": "file-text", "📄": "file-text", "🗒️": "clipboard-list", "✅": "clipboard-check", "☑️": "list-checks", "🔍": "search-check", "🔎": "search-check", "👀": "eye", "📷": "camera", "📸": "camera",
  "🦺": "shield-check", "⛑️": "hard-hat", "👷": "hard-hat", "👷‍♂️": "hard-hat", "👷‍♀️": "hard-hat", "⚠️": "triangle-alert", "🚨": "siren", "🔥": "flame", "🧯": "flame", "🩹": "heart-pulse", "❤️": "heart-pulse",
  "🔬": "microscope", "🧪": "flask-conical", "📏": "ruler", "📐": "ruler", "🎯": "target", "⚖️": "scale", "🏅": "badge-check",
  "🔧": "wrench", "🛠️": "wrench", "⚙️": "cog", "🔨": "hammer", "🔌": "plug-zap", "💡": "lightbulb",
  "📦": "package", "🚚": "truck", "🚛": "truck", "🚗": "car", "🚙": "car", "🏭": "factory", "🏬": "warehouse", "🗄️": "boxes", "🛞": "truck", "🔁": "workflow", "⏱️": "timer", "⏰": "timer",
  "👥": "users", "🧑‍💼": "users", "🙋": "user-check", "🪪": "id-card", "🗓️": "calendar-days", "📅": "calendar-days", "🎓": "graduation-cap", "🧑‍✈️": "user-check",
  "✨": "sparkles", "🧽": "spray-can", "🧹": "sparkles", "🚻": "spray-can", "🗑️": "trash-2", "♻️": "recycle",
  "🌡️": "thermometer", "❄️": "snowflake", "💧": "droplets", "⚡": "zap", "📈": "chart-line", "📊": "chart-line",
  "🧾": "receipt", "💵": "banknote", "💰": "banknote", "🛒": "shopping-cart", "✍️": "signature", "✉️": "mail", "📧": "mail", "🤝": "handshake", "🎧": "headset", "🔑": "key-round", "↩️": "package-check",
  "🏗️": "construction", "🏢": "building-2", "🧱": "brick-wall", "🍽️": "utensils", "🍳": "cooking-pot", "👨‍🍳": "chef-hat", "🍎": "apple", "🏪": "store", "🛍️": "shopping-bag", "🏷️": "tag",
  "🏨": "hotel", "🛏️": "bed-double", "🛎️": "concierge-bell", "🏊": "waves", "🏥": "hospital", "🩺": "stethoscope", "💊": "pill", "💉": "syringe",
  "🌱": "sprout", "🚜": "tractor", "🌾": "wheat", "🍃": "leaf", "☀️": "sun", "🔋": "battery-charging", "⛽": "fuel", "🚢": "ship", "⚓": "anchor", "✈️": "plane", "🏫": "school", "📚": "book-open", "🚌": "bus", "💻": "laptop", "📍": "map-pin",
};

/** ค่าในฐานข้อมูล ("i:package" / "package" / อีโมจิเก่า / ว่าง) → ชื่อไอคอนที่วาดได้เสมอ */
export function resolveIconKey(value: string | null | undefined): string {
  const v = (value || "").trim();
  if (!v) return DEFAULT_ICON.slice(2);
  const k = v.startsWith("i:") ? v.slice(2) : v;
  if (KEYS.has(k)) return k;
  const legacy = LEGACY[v] || LEGACY[v.replace(/️/g, "")] || LEGACY[v + "️"];
  return legacy || DEFAULT_ICON.slice(2);
}

/** ค่าที่จะบันทึก: รหัส "i:<ชื่อ>" เสมอ (รับอีโมจิเก่า/ชื่อเปล่าจาก AI ได้) */
export function normalizeIcon(value: unknown): string {
  return "i:" + resolveIconKey(typeof value === "string" ? value : "");
}

export function iconDef(key: string): IconDef | undefined {
  return DEF.get(key);
}

/** รายชื่อไอคอนทั้งหมด (ใส่ใน prompt ของ AI ให้เลือกจากชุดนี้) */
export const ICON_KEY_LIST = ICONS.map((i) => i.key);
