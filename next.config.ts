import type { NextConfig } from "next";

// Content-Security-Policy ย้ายไปสร้างต่อคำขอใน proxy (src/lib/csp.ts) เพื่อใช้ nonce แทน script 'unsafe-inline'

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  // build ออกมาเป็นชุดเล็ก ๆ ที่รันด้วย `node server.js` ได้เอง (Docker / ECS)
  // แต่บน Vercel ห้ามใช้ standalone — จะชนกับ file-tracing ของ Vercel
  // (Error: ENOENT .next/next-server.js.nft.json) จึงเปิดเฉพาะตอนไม่ได้อยู่บน Vercel
  output: process.env.VERCEL ? undefined : "standalone",

  // ไม่บอก stack ที่ใช้ (ลด fingerprint)
  poweredByHeader: false,

  // ลดขนาด bundle: import เฉพาะไอคอนที่ใช้จริงจาก lucide-react
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },

  // pdfkit อ่านไฟล์ฟอนต์มาตรฐาน (.afm) จาก __dirname ตอน runtime → ห้าม bundle
  // ให้ require จาก node_modules ตรง ๆ เพื่อให้ path ข้อมูลไม่พัง
  serverExternalPackages: ["pdfkit", "nodemailer"],

  // ให้ไฟล์ที่ API อ่านตอน runtime ถูกรวมไปกับ serverless/standalone function:
  // - ฟอนต์ไทย Garuda สำหรับสร้าง PDF ใบส่งฟอร์ม
  // - โฟลเดอร์ข้อมูลฟอนต์มาตรฐานของ pdfkit (.afm)
  outputFileTracingIncludes: {
    "/api/submission/[id]/pdf": [
      "./src/assets/fonts/**",
      "./node_modules/pdfkit/js/data/**",
    ],
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
