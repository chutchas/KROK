import { type DocExtractRecord, type FillSrcTag } from "@/components/FillSourceBar";

export type TableRow = Record<string, string>;
/** รูปถ่ายต่อแถวของตาราง: key → dataURL (เก็บรวมกับรูปของฟิลด์ใน state photos) */
export type MediaPhotos = { get: (key: string) => string | undefined; set: (key: string, dataUrl: string | null) => void };
export const asRows = (v: unknown): TableRow[] => (Array.isArray(v) && v.length && typeof v[0] === "object" ? (v as TableRow[]) : []);

export type Answer = { value?: string | string[] | TableRow[]; note?: string; ai?: string; src?: FillSrcTag | "api" };
export type DocRec = DocExtractRecord & { step?: number; path?: string | null };

// ---- client image shrink to jpeg data-url ----
/** ลายน้ำ: บรรทัดข้อความที่ประทับมุมล่างของรูป (ไม่ส่ง = ไม่ประทับ) */
export function shrinkImage(file: File, stamp?: string[] | null): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      // 1600px ด้านยาว — คมพอสำหรับใช้ต่อ/พิมพ์ (เดิม 900px) · ไฟล์ราว 250–450KB ต่อรูป
      const MAX = 1600;
      const r = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      if (stamp && stamp.length) drawStamp(ctx, c.width, c.height, stamp);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL("image/jpeg", 0.78));
    };
    img.onerror = () => rej(new Error("อ่านรูปไม่ได้"));
    img.src = URL.createObjectURL(file);
  });
}
/** แถบโปร่งดำด้านล่าง + ข้อความขาว (อ่านได้ทั้งรูปสว่าง/มืด) */
export function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, lines: string[]) {
  const fs = Math.max(14, Math.round(Math.min(w, h) * 0.032));
  const pad = Math.round(fs * 0.6);
  const lh = Math.round(fs * 1.3);
  const bandH = pad * 2 + lh * lines.length;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, h - bandH, w, bandH);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "top";
  ctx.font = `600 ${fs}px Sarabun, Anuphan, "Noto Sans Thai", sans-serif`;
  lines.forEach((ln, i) => {
    let t = ln;
    while (t.length > 4 && ctx.measureText(t).width > w - pad * 2) t = `${t.slice(0, -2)}…`;
    ctx.fillText(t, pad, h - bandH + pad + i * lh + Math.round((lh - fs) / 2));
  });
  ctx.restore();
}

export async function detectBarcode(file: File): Promise<string | null> {
  const BD = (window as unknown as { BarcodeDetector?: new () => { detect: (b: ImageBitmap) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const bmp = await createImageBitmap(file);
    const codes = await new BD().detect(bmp);
    return codes[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

