"use client";
import { useEffect } from "react";

// ลงทะเบียน service worker (PWA / offline) — เงียบ ๆ ไม่มี UI
// เฉพาะ production: ตอนพัฒนา (next dev) ชื่อไฟล์ใน /_next/static ไม่เปลี่ยนตามโค้ด แต่ sw.js เสิร์ฟจาก cache ก่อน
// → เบราว์เซอร์ได้โค้ดเก่าค้าง (hydration error / ข้อความเป็นคีย์ดิบ) · dev จึงถอด service worker + ล้าง cache ของแอปทิ้ง
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      if ("caches" in window) {
        caches.keys()
          .then((keys) => Promise.all(keys.filter((k) => k.startsWith("krok-")).map((k) => caches.delete(k))))
          .catch(() => {});
      }
      return;
    }
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ไม่รองรับ/บล็อก — ข้ามไป แอปยังทำงานปกติ */
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
