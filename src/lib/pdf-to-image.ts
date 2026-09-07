"use client";
// แปลง PDF (ฝั่ง client) → รูป JPEG "หน้าละไฟล์" (คมชัด) ส่งเข้า AI หลายรูปพร้อมกัน
// อ่านฟอร์มหลายหน้าได้ครบโดยไม่โดนโมเดลย่อภาพจนตัวอักษรเล็ก
import * as pdfjs from "pdfjs-dist";

// worker แบบ bundle (ไม่พึ่ง CDN) — Turbopack/Next รองรับ new URL(..., import.meta.url)
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const MAX_PAGES = 6;
const TARGET_W = 1600;

// แปลงเป็นรูปหลายไฟล์ (หน้าละไฟล์)
export async function pdfToImageFiles(file: File): Promise<File[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const base = file.name.replace(/\.pdf$/i, "");
  const out: File[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(2.2, TARGET_W / v1.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("ไม่สามารถวาดหน้า PDF ได้");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("แปลง PDF เป็นรูปไม่สำเร็จ"))), "image/jpeg", 0.85)
    );
    out.push(new File([blob], `${base}-p${i}.jpg`, { type: "image/jpeg" }));
  }
  if (out.length === 0) throw new Error("PDF ไม่มีหน้า");
  return out;
}

// เผื่อ back-compat: คืนหน้าแรกเป็นไฟล์เดียว
export async function pdfToImageFile(file: File): Promise<File> {
  return (await pdfToImageFiles(file))[0];
}
