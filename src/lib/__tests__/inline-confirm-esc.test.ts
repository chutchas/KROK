// @vitest-environment jsdom
// กันปัญหา r40: กด Esc ครั้งเดียวปิดทั้งเมนูที่ซ้อนอยู่และกล่องยืนยันฝังหน้า (ต้องปิดแค่ชั้นบนสุด)
import { describe, it, expect, afterEach } from "vitest";
import { createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useInlineConfirmFocus } from "@/lib/use-inline-confirm-focus";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

function Box() {
  const [open, setOpen] = useState(true);
  const { panelRef, triggerRef } = useInlineConfirmFocus(open, () => setOpen(false));
  return open
    ? createElement("div", { ref: panelRef, tabIndex: -1 }, createElement("textarea", { "data-testid": "reason" }))
    : createElement("button", { ref: triggerRef }, "ลบ");
}

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Box)));
}
// กล่องเปิดอยู่ = มี textarea ใน DOM
const isOpen = () => !!host?.querySelector("textarea");
const esc = (target: EventTarget = document.body) =>
  act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.querySelectorAll("[data-extra]").forEach((n) => n.remove());
  root = null; host = null;
});

describe("กล่องยืนยันฝังหน้า · Esc", () => {
  it("Esc ในกล่อง → ปิดกล่อง", () => {
    mount();
    esc(host!.querySelector("textarea")!);
    expect(isOpen()).toBe(false);
  });

  it("คลิกออกนอกกล่อง (โฟกัสที่ body) แล้วกด Esc → ยังปิดได้", () => {
    mount();
    esc(document.body);
    expect(isOpen()).toBe(false);
  });

  it("เมนูที่ซ้อนอยู่ปิดตัวเองและ preventDefault → กล่องยืนยันต้องยังเปิด", () => {
    mount();
    // เมนูลงทะเบียนทีหลังกล่อง (เปิดซ้อนขึ้นมา) — กล่องฟังที่ window จึงทำงานหลังเสมอ
    const menuKey = (e: KeyboardEvent) => { if (e.key === "Escape") e.preventDefault(); };
    document.addEventListener("keydown", menuKey);
    try {
      esc(document.body);
      expect(isOpen()).toBe(true);
    } finally {
      document.removeEventListener("keydown", menuKey);
    }
  });

  it("มี dialog (aria-modal) เปิดอยู่ → Esc เป็นของ dialog ไม่ปิดกล่อง", () => {
    mount();
    const dlg = document.createElement("div");
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("data-extra", "");
    document.body.appendChild(dlg);
    esc(dlg);
    expect(isOpen()).toBe(true);
  });
});
