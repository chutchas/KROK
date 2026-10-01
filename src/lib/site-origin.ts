// ============================================================
// KROK · origin ของเว็บ (ใช้สร้างลิงก์ในอีเมล)
// ตั้ง NEXT_PUBLIC_SITE_URL (เช่น https://krok-iota.vercel.app) จะใช้ค่านี้เสมอ
// ไม่ตั้ง = เดาจาก header ของคำขอปัจจุบัน (ใช้ได้ทั้ง localhost และ Vercel)
// ============================================================
import { headers } from "next/headers";

export async function siteOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
