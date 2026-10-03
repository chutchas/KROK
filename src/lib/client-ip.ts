// ============================================================
// IP ของผู้เรียก (ใช้จำกัดความถี่)
// - Vercel: x-vercel-forwarded-for / x-real-ip ที่ Vercel เขียนทับเอง (client ปลอมไม่ได้)
// - ที่อื่น (Docker/ECS หลัง load balancer): header เหล่านั้น client ส่งมาเองได้ → ใช้ x-forwarded-for
//   นับจากขวาตามจำนวน proxy ที่ไว้ใจ (TRUSTED_PROXY_HOPS, ค่าเริ่มต้น 1 = ALB ตัวเดียว)
//   ค่าทางซ้ายสุดคือค่าที่ client ใส่มาเอง ห้ามใช้
// ============================================================
export function clientIp(req: Request): string {
  const h = req.headers;
  const list = (v: string | null) => (v || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (process.env.VERCEL) {
    return list(h.get("x-vercel-forwarded-for"))[0] || list(h.get("x-real-ip"))[0] || list(h.get("x-forwarded-for")).at(-1) || "unknown";
  }
  const hops = Math.max(1, Math.min(5, Number(process.env.TRUSTED_PROXY_HOPS) || 1));
  const xff = list(h.get("x-forwarded-for"));
  return xff[Math.max(0, xff.length - hops)] || "unknown";
}

/** ไฟล์รูปจริงไหม (ดู magic bytes) → content type ที่ถูกต้อง · ไม่ใช่รูป = null */
export function sniffImage(buf: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  return null;
}
