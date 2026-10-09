"use client";
import { useEffect } from "react";
import { loadAllImages } from "@/lib/print";

/** เปิดจากปุ่ม "พิมพ์": รอฟอนต์ + รูป + จัดตำแหน่งเสร็จ แล้วเปิดหน้าต่างพิมพ์ */
export default function AutoPrint() {
  useEffect(() => {
    let done = false;
    (async () => {
      await Promise.all([document.fonts?.ready, loadAllImages(8000)]);
      // ให้ ResizeObserver วัดความสูงจริง + แบ่งหน้าเสร็จก่อน
      await new Promise((r) => setTimeout(r, 300));
      if (!done) window.print();
    })();
    return () => { done = true; };
  }, []);
  return null;
}
