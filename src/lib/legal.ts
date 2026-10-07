// ============================================================
// ข้อมูลผู้ให้บริการสำหรับเอกสารกฎหมาย (นโยบายความเป็นส่วนตัว / ข้อกำหนดการใช้งาน)
// ค่าเริ่มต้น = InnOlistic Co., Ltd · เปลี่ยนได้ด้วย env (Vercel → Settings → Environment Variables):
//   NEXT_PUBLIC_LEGAL_NAME      ชื่อนิติบุคคลผู้ให้บริการ (ผู้ควบคุมข้อมูลของบัญชีผู้ใช้)
//   NEXT_PUBLIC_LEGAL_ADDRESS   ที่อยู่สำหรับติดต่อ (ขึ้นบรรทัดใหม่ด้วย " | ")
//   NEXT_PUBLIC_LEGAL_PHONE     เบอร์โทร
//   NEXT_PUBLIC_PRIVACY_EMAIL   อีเมลติดต่อเรื่องข้อมูลส่วนบุคคล / DPO
// เปลี่ยนเนื้อหาสาระของเอกสาร → เพิ่ม LEGAL_VERSION (ใช้บันทึกว่าผู้ใช้ยอมรับฉบับไหน)
// ============================================================

export const LEGAL_VERSION = "2026-10-03";
export const LEGAL_EFFECTIVE_TH = "3 ตุลาคม 2569";

export const LEGAL = {
  name: process.env.NEXT_PUBLIC_LEGAL_NAME || "InnOlistic Co., Ltd",
  /** บรรทัดที่อยู่ (ไทย) */
  address: (process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "36 ถ.กรุงเทพกรีฑา หัวหมาก | บางกะปิ กรุงเทพฯ 10240").split("|").map((x) => x.trim()).filter(Boolean),
  /** บรรทัดที่อยู่ (อังกฤษ) — ตั้ง env ที่อยู่เอง = ใช้ค่าเดียวกับภาษาไทย */
  addressEn: process.env.NEXT_PUBLIC_LEGAL_ADDRESS
    ? process.env.NEXT_PUBLIC_LEGAL_ADDRESS.split("|").map((x) => x.trim()).filter(Boolean)
    : ["36 Krungthep Kreetha Rd., Hua Mak", "Bang Kapi, Bangkok 10240"],
  phone: process.env.NEXT_PUBLIC_LEGAL_PHONE ?? "02 586 1979",
  email: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || "innolistic@scgjwd.com",
};

/** ตั้งค่าครบหรือยัง (หน้าแอดมินใช้เตือน) */
export const legalConfigured = () => !!LEGAL.name && !!LEGAL.email;

/** ลิงก์ขอใช้สิทธิเจ้าของข้อมูล (mailto) — ไม่มีอีเมล = null */
export function privacyRequestHref(subject: string): string | null {
  if (!LEGAL.email) return null;
  return `mailto:${LEGAL.email}?subject=${encodeURIComponent(subject)}`;
}
