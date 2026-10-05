// ============================================================
// Content-Security-Policy ต่อคำขอ (สร้างใน proxy พร้อม nonce ใหม่ทุกครั้ง)
// - script: เฉพาะสคริปต์ที่มี nonce ของคำขอนี้ (+ ที่สคริปต์เหล่านั้นโหลดต่อ — strict-dynamic) → สคริปต์ที่ถูกฉีดเข้ามาไม่รัน
// - style: ยังต้อง 'unsafe-inline' เพราะแอปใช้ style attribute ทั่วไป (style รันโค้ดไม่ได้ ความเสี่ยงต่ำกว่า script มาก)
// - img: data:/blob: (รูปถ่าย/ลายเซ็น/QR) + https: (ไฟล์ใน Supabase Storage)
// - connect: self + Supabase เท่านั้น (กันส่งข้อมูลออกไปโฮสต์แปลกปลอม)
// ============================================================

function supabaseOrigins(): string {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    return `${u.origin} wss://${u.host}`;
  } catch {
    return "https: wss:"; // ไม่รู้โฮสต์ = ยอมกว้างขึ้น กันแอปพัง
  }
}

export function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseOrigins()}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function newNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
