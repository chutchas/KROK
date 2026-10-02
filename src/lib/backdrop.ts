// ============================================================
// KROK · ปิด popup เมื่อคลิกพื้นหลัง — แต่ไม่ปิดเมื่อ "ลากคลุม" จากในกล่องออกมาปล่อยนอกกล่อง
//
// ปัญหา: ลากคลุมข้อความในช่อง (เช่น อีเมล/รหัสผ่าน) แล้วไปปล่อยเมาส์นอกกล่อง → browser ส่ง click ให้พื้นหลัง → popup ปิด
// กันหลายชั้น (browser แต่ละตัวส่ง event ไม่เหมือนกัน โดยเฉพาะ Safari):
//   1) จุดกด (pointerdown/mousedown) ต้องอยู่บนพื้นหลังเอง
//   2) จุดปล่อย (click) ต้องอยู่บนพื้นหลังเอง
//   3) ตอนปล่อยต้องไม่มีข้อความถูกเลือกค้างอยู่ (เพิ่งลากคลุม = ไม่ปิด)
//   <div {...backdropClose(onClose)} style={{ position: "fixed", inset: 0 }}> <div>กล่อง</div> </div>
// ============================================================
import type React from "react";

/** มีข้อความถูกเลือกอยู่ไหม — ทั้งในช่องกรอกที่โฟกัสอยู่ และบนหน้า */
export function hasActiveSelection(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement as (Element & { selectionStart?: number | null; selectionEnd?: number | null }) | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
    try {
      if (el.selectionStart != null && el.selectionEnd != null && el.selectionStart !== el.selectionEnd) return true;
    } catch {
      /* input บางชนิด (เช่น email/number) อ่าน selection ไม่ได้ */
    }
  }
  const sel = typeof window !== "undefined" ? window.getSelection?.() : null;
  return !!sel && !sel.isCollapsed && sel.toString().length > 0;
}

export function backdropClose(onClose: () => void) {
  const markDown = (e: React.SyntheticEvent<HTMLElement>) => {
    e.currentTarget.dataset.downSelf = e.target === e.currentTarget ? "1" : "";
  };
  return {
    onPointerDown: markDown,
    onMouseDown: markDown,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const startedOnBackdrop = e.currentTarget.dataset.downSelf === "1";
      e.currentTarget.dataset.downSelf = "";
      if (!startedOnBackdrop || e.target !== e.currentTarget) return;
      if (hasActiveSelection()) return;
      onClose();
    },
  };
}
