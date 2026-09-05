"use client";
import { useEffect } from "react";

// ลงทะเบียน service worker (PWA / offline) — เงียบ ๆ ไม่มี UI
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
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
