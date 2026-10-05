import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SERVER_MESSAGES_EN } from "@/i18n/server-messages";

/** ภาษาที่ผู้ใช้เลือก (หน้าจอเก็บไว้ใน cookie krok_lang) — อ่านครั้งเดียวต่อคำขอ */
const serverLang = cache(async (): Promise<"th" | "en"> => {
  try {
    return (await cookies()).get("krok_lang")?.value === "en" ? "en" : "th";
  } catch {
    return "th"; // อยู่นอกคำขอ (cron/สคริปต์)
  }
});

/** ข้อความ error ที่ตอบกลับผู้ใช้ ตามภาษาที่เลือก (ต้นฉบับภาษาไทย · ไม่มีคำแปล = ภาษาไทย) */
export async function sm(th: string): Promise<string> {
  return (await serverLang()) === "en" ? SERVER_MESSAGES_EN[th] ?? th : th;
}
