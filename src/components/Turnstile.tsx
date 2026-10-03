"use client";
// Cloudflare Turnstile (CAPTCHA) สำหรับฟอร์มสาธารณะ — แสดงเฉพาะเมื่อตั้ง NEXT_PUBLIC_TURNSTILE_SITE_KEY
// token อายุ ~5 นาที: widget ต่ออายุเองระหว่างที่คนกรอกฟอร์ม · ใช้แล้ว (ส่งฟอร์ม) ต้อง reset
import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  getResponse: (id?: string) => string | undefined;
};
declare global { interface Window { turnstile?: TurnstileApi } }

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export interface CaptchaHandle {
  /** token ปัจจุบัน (ว่าง = ยังไม่ผ่าน / ปิด CAPTCHA) */
  token: () => string;
  reset: () => void;
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("turnstile load failed")); };
    document.head.appendChild(s);
  });
  return loading;
}

export default function Turnstile({ handle }: { handle: React.MutableRefObject<CaptchaHandle | null> }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let id: string | undefined;
    let alive = true;
    loadScript().then(() => {
      if (!alive || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, { sitekey: TURNSTILE_SITE_KEY, "refresh-expired": "auto", appearance: "interaction-only" });
      handle.current = {
        token: () => (id && window.turnstile?.getResponse(id)) || "",
        reset: () => { if (id) window.turnstile?.reset(id); },
      };
    }, () => { /* โหลดไม่ได้ → ส่งแล้ว server จะแจ้งให้ลองใหม่ */ });
    return () => { alive = false; handle.current = null; };
  }, [handle]);
  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} style={{ marginTop: 12, display: "flex", justifyContent: "center" }} />;
}
