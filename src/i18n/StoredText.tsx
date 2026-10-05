"use client";
import { useT } from "@/i18n/LanguageProvider";
import { localizeStored } from "@/i18n/stored-text";

/** แสดงข้อความที่บันทึกในผลการส่ง ตามภาษาที่ผู้ใช้เลือก (ข้อมูลที่เก็บยังเป็นรูปแบบเดิม) */
export default function StoredText({ text }: { text: string | null | undefined }) {
  const { lang } = useT();
  return <>{localizeStored(text, lang)}</>;
}
