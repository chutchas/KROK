/**
 * ภาพย่อหน้าแรกของ PDF (PNG) ฝั่งเซิร์ฟเวอร์ — ให้หน้าส่งเสร็จบนมือถือโหลดรูปเล็กรูปเดียว
 * แทนตัวอ่าน PDF (~1.7MB) + ไฟล์ PDF ทั้งไฟล์
 * วาดด้วย pdfjs (legacy build สำหรับ Node) บน @napi-rs/canvas (prebuilt ไม่ต้องคอมไพล์)
 * ไม่มี import "server-only" เพื่อให้เทสต์เรียกได้ — ไฟล์นี้ถูกใช้จาก route handler เท่านั้น
 */
import { createCanvas, DOMMatrix, ImageData, Path2D, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";

type CanvasAndContext = { canvas: Canvas | null; context: SKRSContext2D | null };

/** pdfjs ต้องการตัวสร้าง canvas ของตัวเองเมื่อรันนอกเบราว์เซอร์ */
class NapiCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    const canvas = createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(cc: CanvasAndContext, width: number, height: number) {
    if (!cc.canvas) return;
    cc.canvas.width = Math.max(1, Math.ceil(width));
    cc.canvas.height = Math.max(1, Math.ceil(height));
  }
  destroy(cc: CanvasAndContext) {
    if (cc.canvas) { cc.canvas.width = 0; cc.canvas.height = 0; }
    cc.canvas = null;
    cc.context = null;
  }
}

/** กว้างตามจริงเป็นพิกเซล (หน้าส่งเสร็จแสดง 220px · ×2 ให้คมบนจอ retina) */
export const THUMB_PX = 440;

export async function pdfFirstPagePng(pdf: Uint8Array, widthPx = THUMB_PX): Promise<Buffer> {
  // pdfjs ใน Node หา DOMMatrix/Path2D/ImageData จาก package "canvas" (ไม่ได้ติดตั้ง) → ใส่ของ @napi-rs/canvas ให้ก่อนโหลด
  const gg = globalThis as Record<string, unknown>;
  gg.DOMMatrix ??= DOMMatrix;
  gg.Path2D ??= Path2D;
  gg.ImageData ??= ImageData;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // ตัว worker โหลดเองตรงนี้ (pdfjs ใช้ globalThis.pdfjsWorker ถ้ามี) — ให้ bundler/Vercel เห็นไฟล์ worker
  // แทนการที่ pdfjs import("./pdf.worker.mjs") เองตอน runtime ซึ่ง file-tracing อาจตกหล่น
  const g = globalThis as typeof globalThis & { pdfjsWorker?: unknown };
  if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const doc = await pdfjs.getDocument({
    data: pdf,
    // ไม่ใช้ worker/eval/ฟอนต์ระบบ — ฟอนต์ไทยฝังอยู่ใน PDF แล้ว วาดเป็นเส้นตรงจากไฟล์
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    CanvasFactory: NapiCanvasFactory,
  } as Parameters<typeof pdfjs.getDocument>[0]).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: widthPx / base.width });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
    return await canvas.encode("png");
  } finally {
    await doc.destroy();
  }
}
