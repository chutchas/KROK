"use client";
// ============================================================
// KROK · พฤติกรรมคีย์บอร์ดมาตรฐานของ popup/dialog (WAI-ARIA dialog pattern)
//   1) เปิดแล้วโฟกัสช่องแรกที่กดได้ (หรือ initialFocus ที่ส่งมา)
//   2) Tab / Shift+Tab วนอยู่ในกล่อง ไม่หลุดไปหน้าหลังฉาก
//   3) Esc = ปิด (เฉพาะ dialog บนสุด กรณีซ้อนกันหลายชั้น)
//   4) ปิดแล้วคืนโฟกัสให้ปุ่ม/ช่องที่เปิด dialog
//
//   const box = useRef<HTMLDivElement>(null);
//   useDialogA11y(box, onClose);
//   <div ref={box} role="dialog" aria-modal="true">…</div>
// ============================================================
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]", "area[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])", "textarea:not([disabled])", "iframe", "audio[controls]", "video[controls]",
  "[contenteditable]:not([contenteditable=false])", "[tabindex]:not([tabindex='-1'])",
].join(",");

/** องค์ประกอบที่กด Tab ไปถึงได้จริง (ตัดตัวที่ซ่อนอยู่) */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.hasAttribute("inert") && (el.offsetParent !== null || el.getClientRects().length > 0),
  );
}

// dialog ที่เปิดอยู่เรียงตามลำดับเปิด — ตัวท้ายสุด = บนสุด รับ Esc/Tab
const stack: symbol[] = [];
// ตัวที่รอคืนโฟกัส — กรณีปิด dialog หนึ่งแล้วเปิดอีกอันต่อทันที (คิวของ confirmDialog) ตัวใหม่รับช่วงไปคืนแทน
let pendingRestore: HTMLElement | null = null;

export function useDialogA11y(
  ref: RefObject<HTMLElement | null>,
  onClose?: () => void,
  opts: { active?: boolean; initialFocus?: RefObject<HTMLElement | null> } = {},
) {
  const { active = true, initialFocus } = opts;
  // เก็บ onClose ล่าสุดไว้ใน ref — ไม่ต้องรัน effect ใหม่ทุกครั้งที่ parent ส่งฟังก์ชันใหม่
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const initialRef = useRef(initialFocus);
  useEffect(() => { initialRef.current = initialFocus; }, [initialFocus]);

  useEffect(() => {
    if (!active) return;
    const id = Symbol("dialog");
    stack.push(id);
    let prev = document.activeElement as HTMLElement | null;
    if ((!prev || prev === document.body || !prev.isConnected) && pendingRestore) prev = pendingRestore;
    pendingRestore = null;

    // โฟกัสแรก — ถ้าในกล่องมีตัวที่โฟกัสอยู่แล้ว (เช่น autoFocus) ไม่แย่ง
    const root = ref.current;
    if (root && !root.contains(document.activeElement)) {
      const target = initialRef.current?.current ?? focusableIn(root)[0];
      if (target) target.focus();
      else {
        if (!root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
        root.focus();
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      const box = ref.current;
      if (e.key === "Escape") {
        if (!closeRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !box) return;
      const items = focusableIn(box);
      if (items.length === 0) { e.preventDefault(); box.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const cur = document.activeElement;
      if (e.shiftKey && (cur === first || !box.contains(cur))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (cur === last || !box.contains(cur))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      // คืนโฟกัสให้ตัวที่เปิด dialog — รอ DOM ของ dialog ถูกถอดก่อน
      // ถ้ามี dialog ใหม่เปิดแทรกระหว่างรอ (stack ยาวขึ้น) ไม่แย่งโฟกัสจากตัวใหม่
      if (prev && typeof prev.focus === "function") {
        const depth = stack.length;
        pendingRestore = prev;
        setTimeout(() => {
          if (pendingRestore === prev) pendingRestore = null;
          if (stack.length === depth && prev.isConnected) prev.focus();
        }, 0);
      }
    };
  }, [active, ref]);
}
