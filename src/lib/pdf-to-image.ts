"use client";
// แปลง PDF (ฝั่ง client) → รูป JPEG "หน้าละไฟล์" + ข้อความจริงในไฟล์ (ถ้ามี) ส่งเข้า AI
// - รูป: คมพอให้ server ตัดครึ่งหน้าแบบขยายได้ (ดู image-tiles.ts)
// - ข้อความ: PDF ที่ export จาก Word/Excel มีตัวอักษรจริง → AI ใช้สะกด label ตามนี้ ไม่ต้องเดาจากรูป
import * as pdfjs from "pdfjs-dist";
import { linesOf, usableText } from "@/lib/pdf-text";

// worker แบบ bundle (ไม่พึ่ง CDN) — Turbopack/Next รองรับ new URL(..., import.meta.url)
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const MAX_PAGES = 6;
const TARGET_W = 2000;

export interface PdfPages {
  files: File[];
  /** ข้อความของแต่ละหน้า ("" = หน้านั้นไม่มีข้อความ หรือฟอนต์ฝังแบบอ่านไม่ได้ → ให้ AI อ่านจากรูป) */
  text: string[];
}

export async function pdfToPages(file: File): Promise<PdfPages> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const base = file.name.replace(/\.pdf$/i, "");
  const files: File[] = [];
  const text: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    try {
      const tc = await page.getTextContent();
      const t = linesOf(tc.items as { str: string; transform: number[] }[]);
      text.push(usableText(t) ? t.slice(0, 8000) : "");
    } catch {
      text.push("");
    }
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(3, TARGET_W / v1.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("ไม่สามารถวาดหน้า PDF ได้");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    files.push(await canvasToFile(canvas, `${base}-p${i}.jpg`, 0.85));
  }
  if (files.length === 0) throw new Error("PDF ไม่มีหน้า");
  return { files: await fitUploadBudget(files), text };
}

/** เผื่อ back-compat */
export async function pdfToImageFiles(file: File): Promise<File[]> {
  return (await pdfToPages(file)).files;
}

function canvasToFile(canvas: HTMLCanvasElement, name: string, q: number): Promise<File> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(new File([b], name, { type: "image/jpeg" })) : reject(new Error("แปลงรูปไม่สำเร็จ"))), "image/jpeg", q));
}

/** ขนาดรวมที่ส่งได้ต่อคำขอ (Vercel รับ body ไม่เกิน ~4.5MB) */
const BUDGET = 3.8 * 1024 * 1024;

/**
 * รูปที่ใหญ่เกิน (รูปถ่ายมือถือ 4000px+ / PDF หลายหน้า) → ย่อ/บีบให้รวมกันไม่เกินงบ
 * ย่อไม่ต่ำกว่า 1400px ด้านยาว (ต่ำกว่านี้ตัวหนังสือไทยเล็กอ่านไม่ออก)
 */
export async function fitUploadBudget(files: File[]): Promise<File[]> {
  const total = () => files.reduce((s, f) => s + f.size, 0);
  const steps: { edge: number; q: number }[] = [{ edge: 2400, q: 0.85 }, { edge: 2000, q: 0.8 }, { edge: 1700, q: 0.75 }, { edge: 1400, q: 0.7 }];
  for (const st of steps) {
    if (total() <= BUDGET && files.every((f) => f.size <= 2.5 * 1024 * 1024)) return files;
    files = await Promise.all(files.map((f) => (f.size > BUDGET / files.length ? reencode(f, st.edge, st.q) : f)));
  }
  return files;
}

async function reencode(f: File, edge: number, q: number): Promise<File> {
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
    const s = Math.min(1, edge / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * s);
    canvas.height = Math.round(bmp.height * s);
    const ctx = canvas.getContext("2d");
    if (!ctx) return f;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return await canvasToFile(canvas, f.name.replace(/\.\w+$/, "") + ".jpg", q);
  } catch {
    return f;
  }
}
