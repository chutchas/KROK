"use client";
// ข้อความแปลภาษาสำหรับใช้ใน server component (ซึ่งเรียก useT ไม่ได้ และ server ไม่รู้ภาษาที่ผู้ใช้เลือก)
//   <T k="sub.title" />   ·   <T k="sub.count" vars={{ n: 3 }} />
// ใช้ได้เฉพาะเนื้อหาข้อความ (children) — attribute เช่น placeholder/title ให้ย้ายส่วนนั้นไปเป็น client component
import { useT } from "./LanguageProvider";
import type { MessageKey } from "./dictionaries";

export function T({ k, vars }: { k: MessageKey; vars?: Record<string, string | number> }) {
  const { tt } = useT();
  return <>{tt(k, vars)}</>;
}

/** วันที่/เวลาตามภาษาที่เลือก (เวลาไทยเสมอ) — สำหรับ server component */
export function LocalDate({ iso, time = true }: { iso: string | null | undefined; time?: boolean }) {
  const { lang } = useT();
  if (!iso) return <>—</>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <>—</>;
  // ICU ของ Node กับ browser จัดรูปแบบต่างกันเล็กน้อยได้ → กัน hydration warning
  return (
    <span suppressHydrationWarning>
      {d.toLocaleString(lang === "en" ? "en-GB" : "th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        ...(time ? { timeStyle: "short" } : {}),
      })}
    </span>
  );
}
