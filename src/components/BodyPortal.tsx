"use client";
// ============================================================
// KROK · วาดลูกไว้ที่ <body> โดยตรง
// ใช้กับหน้าต่างลอย (position: fixed) ที่อาจถูกเปิดจากในมุมมองกระดาษ —
// มุมมองกระดาษย่อทั้งหน้าด้วย transform: scale() ซึ่งทำให้ position: fixed ของลูก
// ยึดกับกล่องที่ถูกย่อแทนหน้าจอ (หน้าต่างเพี้ยน/หลุดจอ/กดปุ่มไม่ได้)
// ============================================================
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

export default function BodyPortal({ children }: { children: ReactNode }) {
  // ฝั่ง server ไม่มี document → ไม่วาด (หน้าต่างลอยเปิดหลังผู้ใช้กดเสมอ)
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
