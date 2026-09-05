"use client";
// แปลง PDF (ฝั่ง client) → รูป JPEG หน้าแรก ๆ ต่อกันเป็นภาพเดียว
// ส่งต่อให้ /api/ai/from-image ได้เหมือนอัปโหลดรูป
import * as pdfjs from "pdfjs-dist";

// worker แบบ bundle (ไม่พึ่ง CDN) — Turbopack/Next รองรับ new URL(..., import.meta.url)
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const MAX_PAGES = 3;
const TARGET_W = 1400;

export async function pdfToImageFile(file: File): Promise<File> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);

  const canvases: HTMLCanvasElement[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, TARGET_W / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("ไม่สามารถวาดหน้า PDF ได้");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    canvases.push(canvas);
  }
  if (canvases.length === 0) throw new Error("PDF ไม่มีหน้า");

  // ต่อทุกหน้าเป็นภาพเดียว (แนวตั้ง)
  const width = Math.max(...canvases.map((c) => c.width));
  const gap = 12;
  const height = canvases.reduce((h, c) => h + c.height, 0) + gap * (canvases.length - 1);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("ไม่สามารถรวมหน้า PDF ได้");
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, width, height);
  let y = 0;
  for (const c of canvases) {
    octx.drawImage(c, 0, y);
    y += c.height + gap;
  }

  const blob: Blob = await new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("แปลง PDF เป็นรูปไม่สำเร็จ"))), "image/jpeg", 0.85)
  );
  return new File([blob], file.name.replace(/\.pdf$/i, "") + ".jpg", { type: "image/jpeg" });
}
