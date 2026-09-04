import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KROK — ฟอร์มดิจิทัลหน้างาน",
  description: "แพลตฟอร์มฟอร์ม/checklist หน้างานสำหรับคลังสินค้าและโรงงาน สร้างฟอร์มด้วย AI กรอกจากมือถือ ข้อมูล realtime",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#b26a00",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anuphan:wght@500;600;700&family=Sarabun:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
