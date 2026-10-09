import type { MessageKey } from "@/i18n/dictionaries";

// บทบาทระบบที่ยังใช้ชื่อตั้งต้นภาษาอังกฤษ (Owner/Admin/User จากตอนสร้าง workspace) → แสดงเป็นภาษาที่ผู้ใช้เลือก
// ชื่อที่เจ้าของตั้งเอง (แก้ชื่อแล้ว / บทบาทที่สร้างเอง) แสดงตามที่ตั้งไว้
const DEFAULTS: Record<string, { name: string; k: MessageKey }> = {
  owner: { name: "Owner", k: "role.owner" },
  admin: { name: "Admin", k: "role.admin" },
  user: { name: "User", k: "role.user" },
};

export function roleLabel(key: string, name: string, t: (k: MessageKey) => string): string {
  const d = DEFAULTS[key];
  return d && (!name || name === d.name) ? t(d.k) : name || key;
}
