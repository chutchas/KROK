"use client";
import { createContext, useCallback, useContext } from "react";
import { shrinkImage } from "./fill-types";

/**
 * ลายน้ำรูปถ่าย (ฟอร์มที่เปิด watermark) — FillWizard ส่งตัวสร้างข้อความลงมา
 * ช่องรูป/ตารางเรียก useShrink() แทน shrinkImage ตรง ๆ: ไม่มี provider = ไม่ประทับ
 */
const StampCtx = createContext<(() => string[] | null) | null>(null);
export const PhotoStampProvider = StampCtx.Provider;

export function useShrink() {
  const get = useContext(StampCtx);
  return useCallback((file: File) => shrinkImage(file, get ? get() : null), [get]);
}
