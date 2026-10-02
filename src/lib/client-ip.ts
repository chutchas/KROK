// ============================================================
// IP ของผู้เรียก (ใช้จำกัดความถี่) — บน Vercel ใช้ x-vercel-forwarded-for / x-real-ip ที่ Vercel ตั้งเอง
// (x-forwarded-for ตัวแรก client ปลอมได้ → หลบ rate limit ได้ จึงใช้เป็นตัวสุดท้าย)
// ============================================================
export function clientIp(req: Request): string {
  const h = req.headers;
  const first = (v: string | null) => (v || "").split(",")[0].trim();
  return first(h.get("x-vercel-forwarded-for")) || first(h.get("x-real-ip")) || first(h.get("x-forwarded-for")) || "unknown";
}

/** ไฟล์รูปจริงไหม (ดู magic bytes) → content type ที่ถูกต้อง · ไม่ใช่รูป = null */
export function sniffImage(buf: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  return null;
}
