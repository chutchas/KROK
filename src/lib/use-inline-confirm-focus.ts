"use client";
// กล่องยืนยันแบบฝังในหน้า (ไม่ใช่ dialog): เปิด → โฟกัสช่อง/ปุ่มแรกในกล่อง · ปิด (ยกเลิก) → โฟกัสกลับปุ่มที่กดเปิด
// ไม่งั้นโฟกัสหลุดไปที่ <body> เพราะปุ่มเดิม/กล่องถูกถอดออกจาก DOM
import { useEffect, useRef } from "react";

const FOCUSABLE = 'textarea:not([disabled]), input:not([disabled]), select:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function useInlineConfirmFocus<P extends HTMLElement = HTMLDivElement, T extends HTMLElement = HTMLButtonElement>(open: boolean) {
  const panelRef = useRef<P>(null);
  const triggerRef = useRef<T>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      const panel = panelRef.current;
      const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel)?.focus();
    } else if (wasOpen.current) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);
  return { panelRef, triggerRef };
}
