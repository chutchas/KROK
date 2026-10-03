"use client";
// ข้อความ "admin.*" — แยกจากพจนานุกรมหลัก โหลดเฉพาะหน้าที่ใช้
import { createNsHook } from "./factory";
import type { MessageKey } from "../dictionaries";

const th = {
  "admin.usersTitle": "จัดการผู้ใช้ทั้งระบบ",
  "admin.usersSub": "ดูและกำหนดสิทธิ์ระดับ platform ให้ผู้ใช้ทุกคนข้ามทุก workspace",
  "admin.statUsers": "ผู้ใช้ทั้งหมด",
  "admin.statAdmins": "Platform admin",
  "admin.statDevs": "Developer",
  "admin.search": "ค้นหาชื่อ / อีเมล / workspace",
  "admin.platformRole": "สิทธิ์ระบบ",
  "admin.prAdmin": "Platform Admin",
  "admin.prDev": "Developer",
  "admin.prUser": "User (ลูกค้า)",
  "admin.memberOf": "เป็นสมาชิกใน workspace",
  "admin.removeFromWs": "นำออก",
  "admin.removeConfirm": "นำผู้ใช้ออกจาก workspace นี้?",
  "admin.you": "คุณ",
  "admin.noneFound": "ไม่พบผู้ใช้",
  "admin.plan": "แพ็กเกจ",
  "admin.planHint": "แพ็กเกจของบัญชีนี้ — ใช้ร่วมทุก workspace ที่ผู้ใช้นี้สร้าง โควตานับรวม มีผลทันที",
  "admin.billingWs": "ใช้แพ็กเกจของบัญชีนี้",
  "admin.otherOwnerWs": "ใช้แพ็กเกจของเจ้าของ workspace",
  "admin.planFree": "ฟรี",
  "admin.planHidden": "ซ่อน",
  "admin.planConfirm": "เปลี่ยนแพ็กเกจของ {who} เป็น {plan}? — มีผลทันทีกับ {n} workspace ที่เขาเป็นเจ้าของ (ไม่ออกใบแจ้งหนี้)",
  "admin.planSaved": "{who} ใช้แพ็กเกจ {plan} แล้ว",
  "admin.saved": "บันทึกแล้ว",
} as const;
export type AdminKey = keyof typeof th;
export type AdminAnyKey = MessageKey | AdminKey;

const en: Record<AdminKey, string> = {
  "admin.usersTitle": "System user management",
  "admin.usersSub": "View and set platform-level access for every user across all workspaces",
  "admin.statUsers": "Total users",
  "admin.statAdmins": "Platform admins",
  "admin.statDevs": "Developers",
  "admin.search": "Search name / email / workspace",
  "admin.platformRole": "System role",
  "admin.prAdmin": "Platform Admin",
  "admin.prDev": "Developer",
  "admin.prUser": "User (customer)",
  "admin.memberOf": "Member of workspaces",
  "admin.removeFromWs": "Remove",
  "admin.removeConfirm": "Remove this user from the workspace?",
  "admin.you": "you",
  "admin.noneFound": "No users found",
  "admin.plan": "Plan",
  "admin.planHint": "This account's plan — shared by every workspace the user created; quotas are combined; applies immediately",
  "admin.billingWs": "uses this account's plan",
  "admin.otherOwnerWs": "uses the owner's plan",
  "admin.planFree": "Free",
  "admin.planHidden": "hidden",
  "admin.planConfirm": "Change {who} to {plan}? It applies immediately to the {n} workspace(s) they own (no invoice is issued).",
  "admin.planSaved": "{who} is now on {plan}",
  "admin.saved": "Saved",
};

export const useAdminT = createNsHook<AdminKey>(th, en);
export const adminDicts = { th, en };
