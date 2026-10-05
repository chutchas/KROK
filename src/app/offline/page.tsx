import type { Metadata } from "next";
import OfflineApp from "./OfflineApp";

export const metadata: Metadata = { title: "KROK — โหมดออฟไลน์" };

// หน้าออฟไลน์: service worker เก็บไว้ล่วงหน้า แล้วส่งให้แทนหน้ารายการฟอร์ม/หน้ากรอก เมื่อไม่มีเน็ต
// เนื้อหาทั้งหมดอ่านจาก IndexedDB ในเครื่อง (ไม่มีข้อมูลผู้ใช้ใน HTML นี้)
export default function OfflinePage() {
  return <OfflineApp />;
}
