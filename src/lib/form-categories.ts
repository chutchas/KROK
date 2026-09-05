// ประเภทฟอร์ม (preset) — เก็บเป็น key ใน schema.category, ถ้ากำหนดเองเก็บเป็นข้อความตรง ๆ
export interface FormCategory { key: string; th: string; en: string }

export const FORM_CATEGORIES: FormCategory[] = [
  { key: "inspection", th: "ตรวจสอบ", en: "Inspection" },
  { key: "checklist", th: "เช็คลิสต์", en: "Checklist" },
  { key: "safety", th: "ความปลอดภัย", en: "Safety" },
  { key: "quality", th: "คุณภาพ (QC)", en: "Quality (QC)" },
  { key: "production", th: "การผลิต", en: "Production" },
  { key: "maintenance", th: "บำรุงรักษา", en: "Maintenance" },
  { key: "logistics", th: "คลัง/ขนส่ง", en: "Logistics" },
  { key: "hr", th: "บุคคล/เข้างาน", en: "HR / Attendance" },
  { key: "audit", th: "ตรวจประเมิน", en: "Audit" },
  { key: "other", th: "อื่นๆ", en: "Other" },
];

const MAP = new Map(FORM_CATEGORIES.map((c) => [c.key, c]));

// คืนชื่อที่แสดง: ถ้าเป็น preset ใช้ตามภาษา, ถ้ากำหนดเองคืนข้อความเดิม
export function categoryLabel(value: string | undefined | null, lang: "th" | "en"): string {
  if (!value) return "";
  const c = MAP.get(value);
  return c ? (lang === "en" ? c.en : c.th) : value;
}

export function isPresetCategory(value: string | undefined | null): boolean {
  return !!value && MAP.has(value);
}
