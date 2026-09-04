import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // build ออกมาเป็นชุดเล็ก ๆ ที่รันด้วย `node server.js` ได้เอง
  // จำเป็นสำหรับ Docker / ECS (ไม่ต้องยก node_modules ทั้งก้อนเข้า image)
  output: "standalone",
};

export default nextConfig;
