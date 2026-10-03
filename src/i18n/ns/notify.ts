"use client";
// ข้อความ "notify.*" — แยกจากพจนานุกรมหลัก โหลดเฉพาะหน้าที่ใช้
import { createNsHook } from "./factory";
import type { MessageKey } from "../dictionaries";

const th = {
  "notify.title": "แจ้งเตือน LINE / Email",
  "notify.subtitle": "แจ้งเตือนอัตโนมัติเมื่อมีการส่งฟอร์มหรืออนุมัติ — ใส่คีย์ของแต่ละองค์กรเอง",
  "notify.line": "LINE (Messaging API)",
  "notify.lineEnable": "เปิดแจ้งเตือนผ่าน LINE",
  "notify.lineToken": "Channel access token",
  "notify.lineTokenHint": "จาก LINE Official Account → Messaging API",
  "notify.lineTarget": "ID ปลายทาง (userId/groupId)",
  "notify.lineTargetHint": "userId (U…) หรือ groupId (C…) ของผู้รับ — บอทต้องเป็นเพื่อน/อยู่ในกลุ่มก่อน",
  "notify.lineBroadcast": "ส่งถึงผู้ติดตาม OA ทั้งหมด (broadcast — ใช้โควตาข้อความตามจำนวนผู้ติดตาม)",
  "notify.email": "อีเมล (SMTP)",
  "notify.emailEnable": "เปิดแจ้งเตือนผ่านอีเมล",
  "notify.smtpHost": "SMTP host",
  "notify.smtpPort": "พอร์ต",
  "notify.smtpUser": "ผู้ใช้ SMTP",
  "notify.smtpPass": "รหัสผ่าน SMTP",
  "notify.emailFrom": "อีเมลผู้ส่ง (From)",
  "notify.emailTo": "อีเมลผู้รับ (คั่นด้วย , หรือขึ้นบรรทัดใหม่)",
  "notify.events": "แจ้งเมื่อ",
  "notify.evCreated": "ส่งฟอร์มใหม่",
  "notify.evApproved": "อนุมัติแล้ว",
  "notify.evRejected": "ถูกตีกลับ",
  "notify.evCase": "งานส่งต่อ/ส่งกลับ (ฟอร์มกรอกหลายคน)",
  "notify.failOnly": "เฉพาะผลไม่ผ่าน (สำหรับฟอร์มที่ส่งใหม่)",
  "notify.save": "บันทึกการตั้งค่า",
  "notify.saving": "กำลังบันทึก…",
  "notify.saved": "บันทึกแล้ว",
  "notify.test": "ทดสอบส่ง",
  "notify.testing": "กำลังทดสอบ…",
  "notify.secretSaved": "•••••• (บันทึกไว้แล้ว — เว้นว่างเพื่อใช้ค่าเดิม)",
  "notify.saveFirst": "บันทึกการตั้งค่าก่อนกดทดสอบ",
} as const;
export type NotifyKey = keyof typeof th;
export type NotifyAnyKey = MessageKey | NotifyKey;

const en: Record<NotifyKey, string> = {
  "notify.title": "LINE / Email notifications",
  "notify.subtitle": "Auto-notify on submissions or approvals — each org uses its own keys",
  "notify.line": "LINE (Messaging API)",
  "notify.lineEnable": "Enable LINE notifications",
  "notify.lineToken": "Channel access token",
  "notify.lineTokenHint": "From your LINE Official Account → Messaging API",
  "notify.lineTarget": "Target ID (userId/groupId)",
  "notify.lineTargetHint": "Recipient userId (U…) or groupId (C…) — the bot must be a friend / in the group",
  "notify.lineBroadcast": "Send to all OA followers (broadcast — uses message quota per follower)",
  "notify.email": "Email (SMTP)",
  "notify.emailEnable": "Enable email notifications",
  "notify.smtpHost": "SMTP host",
  "notify.smtpPort": "Port",
  "notify.smtpUser": "SMTP user",
  "notify.smtpPass": "SMTP password",
  "notify.emailFrom": "From address",
  "notify.emailTo": "Recipients (comma or newline separated)",
  "notify.events": "Notify on",
  "notify.evCreated": "New submission",
  "notify.evApproved": "Approved",
  "notify.evRejected": "Rejected",
  "notify.evCase": "Job handed off / sent back (multi-person forms)",
  "notify.failOnly": "Only failed results (for new submissions)",
  "notify.save": "Save settings",
  "notify.saving": "Saving…",
  "notify.saved": "Saved",
  "notify.test": "Send test",
  "notify.testing": "Testing…",
  "notify.secretSaved": "•••••• (saved — leave empty to keep)",
  "notify.saveFirst": "Save settings before testing",
};

export const useNotifyT = createNsHook<NotifyKey>(th, en);
export const notifyDicts = { th, en };
