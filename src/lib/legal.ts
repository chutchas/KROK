// ============================================================
// ข้อมูลผู้ให้บริการสำหรับเอกสารกฎหมาย (นโยบายความเป็นส่วนตัว / ข้อกำหนดการใช้งาน)
// ตั้งค่าผ่าน env (Vercel → Settings → Environment Variables) — ไม่ตั้ง = แสดงช่องว่างให้เห็นว่าต้องกรอก
//   NEXT_PUBLIC_LEGAL_NAME      ชื่อนิติบุคคล/บุคคลผู้ให้บริการ (ผู้ควบคุมข้อมูลของบัญชีผู้ใช้)
//   NEXT_PUBLIC_LEGAL_ADDRESS   ที่อยู่สำหรับติดต่อ
//   NEXT_PUBLIC_PRIVACY_EMAIL   อีเมลติดต่อเรื่องข้อมูลส่วนบุคคล / DPO
// เปลี่ยนเนื้อหาสาระของเอกสาร → เพิ่ม LEGAL_VERSION (ใช้บันทึกว่าผู้ใช้ยอมรับฉบับไหน)
// ============================================================

export const LEGAL_VERSION = "2026-10-03";
export const LEGAL_EFFECTIVE_TH = "3 ตุลาคม 2569";

export const LEGAL = {
  name: process.env.NEXT_PUBLIC_LEGAL_NAME || "〔ชื่อผู้ให้บริการ KROK〕",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "〔ที่อยู่ผู้ให้บริการ〕",
  email: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || "",
};

/** ตั้งค่าครบหรือยัง (หน้าแอดมินใช้เตือน) */
export const legalConfigured = () =>
  !!process.env.NEXT_PUBLIC_LEGAL_NAME && !!process.env.NEXT_PUBLIC_PRIVACY_EMAIL;

/** ลิงก์ขอใช้สิทธิเจ้าของข้อมูล (mailto) — ไม่มีอีเมล = null */
export function privacyRequestHref(subject: string): string | null {
  if (!LEGAL.email) return null;
  return `mailto:${LEGAL.email}?subject=${encodeURIComponent(subject)}`;
}
