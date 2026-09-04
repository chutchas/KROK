import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // ใช้ <img> กับ data-URL/รูป signed จาก storage ตั้งใจแล้ว (next/image ไม่เหมาะ)
      "@next/next/no-img-element": "off",
      // โหลดฟอนต์ผ่าน <link> ใน App Router head ถูกต้องแล้ว
      "@next/next/no-page-custom-font": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
