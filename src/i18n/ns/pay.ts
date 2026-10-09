"use client";
// ข้อความ "pay.*" — แยกจากพจนานุกรมหลัก โหลดเฉพาะหน้าที่ใช้
import { createNsHook } from "./factory";
import type { MessageKey } from "../dictionaries";

const th = {
  "pay.waiting": "กำลังรอยืนยันการชำระเงินจากระบบชำระเงิน… (ไม่ต้องปิดหน้านี้)",
  "pay.paid": "ชำระเงินสำเร็จ — แพ็กเกจของบัญชีอัปเดตแล้ว",
  "pay.failed": "การชำระเงินไม่สำเร็จหรือถูกยกเลิก — ลองใหม่ได้",
  "pay.timeout": "ยังไม่ได้รับผลการชำระ — ถ้าชำระแล้ว แพ็กเกจจะอัปเดตเองเมื่อระบบชำระเงินแจ้งผล (รีเฟรชหน้านี้ภายหลัง)",
  "pay.pending": "มีใบแจ้งหนี้ค้างชำระ: {plan} ฿{amount}",
  "pay.continue": "ไปชำระต่อ",
  "pay.expiresIn": "แพ็กเกจใช้ได้ถึง {date} (อีก {n} วัน)",
  "pay.expired": "แพ็กเกจหมดอายุแล้ว — ต่ออายุภายใน 3 วันเพื่อไม่ให้ถูกลดเป็น Free",
  "pay.renew": "ต่ออายุ 1 เดือน",
  "pay.title": "การชำระเงิน",
  "pay.soon": "เร็วๆ นี้",
  "pay.sub": "ตั้งค่าช่องทางชำระเงินสำหรับแพ็กเกจเสียเงิน (จะเปิดใช้เมื่อผูกระบบชำระเงินเสร็จ)",
  "pay.available": "ช่องทางชำระเงินที่รองรับ",
  "pay.disabledNote": "ระบบชำระเงินยังไม่เปิด — การซื้อแพ็กเกจเสียเงินถูกล็อกไว้ชั่วคราว",
} as const;
export type PayKey = keyof typeof th;
export type PayAnyKey = MessageKey | PayKey;

const en: Record<PayKey, string> = {
  "pay.waiting": "Waiting for payment confirmation… (keep this page open)",
  "pay.paid": "Payment received — your account's plan has been updated",
  "pay.failed": "Payment failed or was cancelled — you can try again",
  "pay.timeout": "No payment result yet — if you paid, the plan updates automatically once the gateway confirms (refresh later)",
  "pay.pending": "Unpaid invoice: {plan} ฿{amount}",
  "pay.continue": "Continue to payment",
  "pay.expiresIn": "Plan active until {date} ({n} days left)",
  "pay.expired": "Plan expired — renew within 3 days to avoid being moved to Free",
  "pay.renew": "Renew 1 month",
  "pay.title": "Payments",
  "pay.soon": "Soon",
  "pay.sub": "Configure a payment method for paid plans (enabled once billing is wired up)",
  "pay.available": "Supported payment channels",
  "pay.disabledNote": "Payments are not enabled yet — buying paid plans is temporarily locked",
};

export const usePayT = createNsHook<PayKey>(th, en);
export const payDicts = { th, en };
