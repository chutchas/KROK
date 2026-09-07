// การซื้อแผนเสียเงินจริง — ยังล็อกไว้จนกว่าจะต่อ checkout flow ครบวง
// (การตั้งค่า provider ชำระเงินอยู่ที่ ตั้งค่าระบบ > การชำระเงิน — ดู payments-server.ts)
// เมื่อ checkout พร้อมแล้วให้เปลี่ยนเป็น true (หรืออ่านจาก DB)
export const PAYMENTS_ENABLED = false;
