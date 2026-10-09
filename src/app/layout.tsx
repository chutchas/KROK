import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { DialogHost } from "@/components/dialogs";
// ฟอนต์โฮสต์ในแอปเอง (เดิมโหลดจาก Google Fonts — ต้องต่อโดเมนอื่นก่อนแสดงผล ช้าบนเน็ตมือถือ)
// ไฟล์แยกตามชุดอักษร (unicode-range) — เบราว์เซอร์โหลดเฉพาะไทย/ละตินที่ใช้จริง
import "@fontsource/anuphan/500.css";
import "@fontsource/anuphan/600.css";
import "@fontsource/anuphan/700.css";
import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/500.css";
import "@fontsource/sarabun/600.css";
import "./globals.css";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import ErrorReporter from "@/components/ErrorReporter";
import PrintReady from "@/components/PrintReady";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  // หน้าในแอปตั้งชื่อของตัวเอง → "<ชื่อหน้า> · KROK" (แยกแท็บได้ · โปรแกรมอ่านหน้าจอบอกว่าอยู่หน้าไหน)
  title: { default: "KROK — ฟอร์มดิจิทัลหน้างาน", template: "%s · KROK" },
  description: "แพลตฟอร์มฟอร์ม/checklist หน้างานสำหรับคลังสินค้าและโรงงาน สร้างฟอร์มด้วย AI กรอกจากมือถือ ข้อมูล realtime",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
};

// ตั้ง data-theme ก่อน paint เพื่อไม่ให้จอกระพริบตอนโหลด
const THEME_INIT = `(function(){try{var t=localStorage.getItem('krok_theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // nonce จาก proxy (CSP) — อ่าน header ทำให้ทุกหน้า render แบบ dynamic ซึ่งจำเป็นต่อ nonce
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="th">
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <ServiceWorkerRegister />
        <LanguageProvider initial="th">{children}<DialogHost /></LanguageProvider>
        <ErrorReporter />
        <PrintReady />
      </body>
    </html>
  );
}
