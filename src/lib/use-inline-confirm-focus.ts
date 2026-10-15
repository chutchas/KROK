"use client";
// กล่องยืนยันแบบฝังในหน้า (ไม่ใช่ dialog): เปิด → โฟกัสช่อง/ปุ่มแรกในกล่อง · ปิด (ยกเลิก) → โฟกัสกลับปุ่มที่กดเปิด
// ไม่งั้นโฟกัสหลุดไปที่ <body> เพราะปุ่มเดิม/กล่องถูกถอดออกจาก DOM
import { useEffect, useRef } from "react";

const FOCUSABLE = 'textarea:not([disabled]), input:not([disabled]), select:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** onEscape: กด Esc ในกล่อง = ยกเลิก (เหมือน dialog) */
export function useInlineConfirmFocus<P extends HTMLElement = HTMLDivElement, T extends HTMLElement = HTMLButtonElement>(open: boolean, onEscape?: () => void) {
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
  const escRef = useRef(onEscape);
  useEffect(() => { escRef.current = onEscape; });
  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && escRef.current) { e.stopPropagation(); escRef.current(); } };
    panel.addEventListener("keydown", onKey);
    return () => panel.removeEventListener("keydown", onKey);
  }, [open]);
  return { panelRef, triggerRef };
}
