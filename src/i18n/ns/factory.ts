"use client";
// พจนานุกรมย่อยรายหน้า — ข้อความที่ใช้เฉพาะบางหน้าไม่ต้องติดไปกับพจนานุกรมหลักที่โหลดทุกหน้า
// hook ที่ได้ใช้แทน useT(): key ของหน้านั้นอ่านจากชุดย่อย ที่เหลือส่งต่อให้ useT() ตามปกติ
import { useCallback } from "react";
import { useT } from "../LanguageProvider";
import { interpolate, type MessageKey } from "../dictionaries";

export function createNsHook<K extends string>(th: Record<K, string>, en: Record<K, string>) {
  const own = (k: string): k is K => k in th;
  return function useNsT() {
    const base = useT();
    const { lang } = base;
    const baseT = base.t;
    const t = useCallback(
      (k: MessageKey | K): string => (own(k) ? (lang === "en" ? en[k] : undefined) ?? th[k] : baseT(k)),
      [lang, baseT]
    );
    const tt = useCallback((k: MessageKey | K, vars?: Record<string, string | number>) => interpolate(t(k), vars), [t]);
    return { ...base, t, tt };
  };
}
