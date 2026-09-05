// การชำระเงิน — ยังไม่เปิดใช้งาน (บล็อกการซื้อแผนเสียเงินจริงไว้ก่อน)
// เมื่อผูก payment gateway จริงแล้ว ให้เปลี่ยนเป็น true (หรืออ่านจาก env/DB)
export const PAYMENTS_ENABLED = false;

export type Gateway = "omise" | "stripe" | "manual";

export const GATEWAYS: { key: Gateway; name: string; note: string }[] = [
  { key: "omise", name: "Omise", note: "บัตรเครดิต/พร้อมเพย์ (ไทย)" },
  { key: "stripe", name: "Stripe", note: "บัตรเครดิต (สากล)" },
  { key: "manual", name: "โอนเงิน/ออกใบแจ้งหนี้เอง", note: "ยืนยันการชำระด้วยมือ" },
];
