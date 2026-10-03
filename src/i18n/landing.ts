"use client";
// คำแปลของหน้าแรก (landing) — key "lp.*" อยู่ในไฟล์นี้แทนพจนานุกรมหลัก
// (ข้อความหน้าแรก ~27KB ไม่ต้องติดไปกับทุกหน้าในแอป) · key อื่นส่งต่อให้ useT() ตามปกติ
import { useCallback } from "react";
import { useT } from "./LanguageProvider";
import { interpolate, type MessageKey } from "./dictionaries";
import { lpTh } from "./landing.th";
import { lpEn } from "./landing.en";

export type LpKey = keyof typeof lpTh;
export type AnyKey = MessageKey | LpKey;

const isLp = (k: string): k is LpKey => k in lpTh;

export function useLp() {
  const base = useT();
  const { lang } = base;
  const baseT = base.t;
  const t = useCallback(
    (k: AnyKey): string => (isLp(k) ? (lang === "en" ? lpEn[k] : undefined) ?? lpTh[k] : baseT(k)),
    [lang, baseT]
  );
  const tt = useCallback((k: AnyKey, vars?: Record<string, string | number>) => interpolate(t(k), vars), [t]);
  return { ...base, t, tt };
}
