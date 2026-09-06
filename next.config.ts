import type { NextConfig } from "next";

// ส่วนหัวความปลอดภัย (ใช้กับทุกเส้นทาง)
// - ป้องกัน clickjacking, MIME sniffing, ลด referrer leak, บังคับ HTTPS
// - Permissions-Policy: เปิดเฉพาะ "กล้อง" (จำเป็นสำหรับถ่ายรูป/สแกนบาร์โค้ด) ปิด mic/geolocation
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()" },
  // กัน clickjacking แบบ modern (คู่กับ X-Frame-Options) โดยไม่กระทบ resource อื่น
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
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
