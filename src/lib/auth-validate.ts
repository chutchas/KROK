// ============================================================
// ตรวจช่องในหน้าเข้าสู่ระบบ / สมัคร / ตั้งรหัสผ่าน ระหว่างพิมพ์ (ไม่รอกดส่ง)
// คืน key ข้อความ (i18n) หรือ null = ผ่าน
// ============================================================

export const PASSWORD_MIN = 6;

export type EmailIssue = "login.emailRequired" | "login.emailThai" | "login.emailInvalid";
export type PasswordIssue = "login.passwordRequired" | "login.passwordShort";

/** อีเมล: ตัวอักษรนอกภาษาอังกฤษ (มักลืมสลับแป้นพิมพ์) บอกทันที · รูปแบบผิด บอกหลังออกจากช่อง */
export function emailIssue(v: string): EmailIssue | null {
  const s = v.trim();
  if (!s) return "login.emailRequired";
  if (/[^\x21-\x7e]/.test(s)) return "login.emailThai";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return "login.emailInvalid";
  return null;
}

/** รหัสผ่าน: เข้าสู่ระบบ = ห้ามว่าง · ตั้งใหม่/สมัคร = อย่างน้อย 6 ตัว */
export function passwordIssue(v: string, creating: boolean): PasswordIssue | null {
  if (!v) return "login.passwordRequired";
  if (creating && v.length < PASSWORD_MIN) return "login.passwordShort";
  return null;
}

/** ตัวอักษรนอกภาษาอังกฤษ — แจ้งทันทีระหว่างพิมพ์ ไม่ต้องรอออกจากช่อง */
export const hasNonAscii = (v: string) => /[^\x20-\x7e]/.test(v);
