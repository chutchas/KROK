import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/i18n/LanguageProvider";

export const metadata: Metadata = {
  title: "KROK — ฟอร์มดิจิทัลหน้างาน",
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
  maximumScale: 1,
};

// ตั้ง data-theme ก่อน paint เพื่อไม่ให้จอกระพริบตอนโหลด
const THEME_INIT = `(function(){try{var t=localStorage.getItem('krok_theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anuphan:wght@500;600;700&family=Sarabun:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <LanguageProvider initial="th">{children}</LanguageProvider>
      </body>
    </html>
  );
}
