// ============================================================
// KROK · origin ของเว็บ (ใช้สร้างลิงก์ในอีเมล)
// ลำดับ: NEXT_PUBLIC_SITE_URL → โดเมน production ของ Vercel (VERCEL_PROJECT_PRODUCTION_URL)
//       → header ของคำขอ (เฉพาะตอนพัฒนาในเครื่อง)
// production ห้ามเชื่อ Host / X-Forwarded-Host จากคำขอ: ผู้ไม่หวังดีใส่ host ปลอมแล้วสั่งส่งอีเมลเชิญ
// ลิงก์ในอีเมล (ส่งจากผู้ส่งจริงของ KROK) จะชี้ไปเว็บปลอมได้
// ============================================================
import { headers } from "next/headers";

const clean = (u: string) => u.trim().replace(/\/+$/, "");

export async function siteOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env?.trim()) return clean(env);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel?.trim()) return `https://${clean(vercel).replace(/^https?:\/\//, "")}`;
  if (process.env.NODE_ENV === "production") {
    console.warn("[krok] NEXT_PUBLIC_SITE_URL is not set — using localhost for email links");
    return "http://localhost:3000";
  }
  const h = await headers();
  const host = h.get("host") || "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}
