import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone = build ออกมาเป็นชุดเล็ก ๆ ที่รันด้วย `node server.js` ได้เอง
  // จำเป็นสำหรับ Docker / ECS แต่ Vercel มี builder ของตัวเองและไม่รับ output นี้
  // VERCEL=1 ถูกตั้งให้อัตโนมัติตอน build บน Vercel
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
};

export default nextConfig;
