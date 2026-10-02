import "server-only";
import { timingSafeEqual } from "crypto";

/** งานตั้งเวลา: Authorization: Bearer <CRON_SECRET> (Vercel Cron ส่งให้อัตโนมัติเมื่อตั้ง env CRON_SECRET) */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) return false;
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
