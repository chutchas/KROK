// ============================================================
// KROK · ปิด popup เมื่อคลิกพื้นหลัง — แต่ไม่ปิดเมื่อ "ลากคลุม" จากในกล่องออกมาปล่อยนอกกล่อง
//
// ปัญหาเดิม: onClick ของพื้นหลังทำงานเมื่อกดเมาส์ในกล่อง (เช่น ลากคลุมข้อความในช่องอีเมล) แล้วไปปล่อยนอกกล่อง
//   → browser ส่ง click ให้พื้นหลัง (ตัวแม่ร่วม) → popup ปิดทั้งที่ผู้ใช้ไม่ได้ตั้งใจ
// แก้: ปิดเฉพาะเมื่อทั้งจุดกด (pointerdown) และจุดปล่อย (click) อยู่บนพื้นหลังเอง
//   <div {...backdropClose(onClose)} style={{ position: "fixed", inset: 0 }}> <div>กล่อง</div> </div>
// ============================================================
import type React from "react";

export function backdropClose(onClose: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.dataset.downSelf = e.target === e.currentTarget ? "1" : "";
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const startedOnBackdrop = e.currentTarget.dataset.downSelf === "1";
      e.currentTarget.dataset.downSelf = "";
      if (startedOnBackdrop && e.target === e.currentTarget) onClose();
    },
  };
}
