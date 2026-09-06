import type { NextConfig } from "next";

// โฮสต์ Supabase (สำหรับ connect-src ของ CSP: auth + realtime wss + storage)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
let supabaseOrigin = "";
let supabaseWss = "";
try {
  if (supabaseUrl) {
    const u = new URL(supabaseUrl);
    supabaseOrigin = u.origin;
    supabaseWss = `wss://${u.host}`;
  }
} catch { /* ignore */ }

// ถ้าไม่รู้โฮสต์ Supabase ตอน build ให้ยอมรับ https:/wss: กว้างขึ้น (กันแอปพัง)
const connectSrc = supabaseOrigin
  ? `'self' ${supabaseOrigin} ${supabaseWss}`
  : `'self' https: wss:`;

// Content-Security-Policy:
// - script/style ต้องมี 'unsafe-inline' เพราะแอปใช้ inline style/สคริปต์ bootstrap ของ Next
// - img: 'self' + data:/blob: (รูปถ่าย/ลายเซ็น) + https: (ไฟล์ใน Supabase Storage)
// - connect: จำกัดให้เหลือ self + Supabase (กันการส่งข้อมูลออกไปโฮสต์แปลกปลอม)
// - worker/blob สำหรับ pdf.js, object-src none, base-uri/form-action/frame-ancestors self
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  // build ออกมาเป็นชุดเล็ก ๆ ที่รันด้วย `node server.js` ได้เอง
  // จำเป็นสำหรับ Docker / ECS (ไม่ต้องยก node_modules ทั้งก้อนเข้า image)
  output: "standalone",

  // ไม่บอก stack ที่ใช้ (ลด fingerprint)
  poweredByHeader: false,

  // ลดขนาด bundle: import เฉพาะไอคอนที่ใช้จริงจาก lucide-react
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
