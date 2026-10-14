"use client";
import { useEffect } from "react";
import { ONB_DOC_SEEN_KEY } from "@/app/(app)/dashboard/GettingStarted";

/** เปิดหน้าเอกสารใบไหนก็ได้ = ขั้น "ดูเอกสาร A4" ของการ์ดเริ่มต้นใช้งานเสร็จแล้ว (ไม่ต้องกดจากการ์ดเท่านั้น) */
export default function OnboardingSeen() {
  useEffect(() => {
    try { localStorage.setItem(ONB_DOC_SEEN_KEY, "1"); } catch { /* โหมดส่วนตัว = ไม่จำ */ }
  }, []);
  return null;
}
