"use client";
import { useEffect } from "react";
import { loadAllImages } from "@/lib/print";

// กด Ctrl+P / เมนูพิมพ์ของเบราว์เซอร์ (ไม่ผ่านปุ่มของแอป) → บังคับรูป lazy ให้โหลด (best-effort)
export default function PrintReady() {
  useEffect(() => {
    const before = () => { void loadAllImages(); };
    window.addEventListener("beforeprint", before);
    return () => window.removeEventListener("beforeprint", before);
  }, []);
  return null;
}
