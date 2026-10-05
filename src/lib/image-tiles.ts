import "server-only";
import type { ImageInput } from "@/lib/ai";

// ============================================================
// เตรียมรูปฟอร์มให้ AI อ่านตัวหนังสือเล็กได้ชัดขึ้น
// โมเดล vision ย่อรูปลงเหลือราว 1–1.2 ล้านพิกเซลก่อนอ่านเสมอ → หน้า A4 ทั้งหน้าตัวหนังสือไทยตัวเล็กจะเบลอ
// วิธี: ส่ง "ทั้งหน้า" (ดูโครงสร้าง/ลำดับ) + "ครึ่งบน/ครึ่งล่าง แบบซ้อนกันเล็กน้อย" (ขยาย ~1.4 เท่า ใช้อ่านคำ)
// ครึ่งแบ่งตามแนวนอน → บรรทัดข้อความไม่ถูกตัดกลางบรรทัด · ส่วนซ้อน 10% กันบรรทัดตรงรอยต่อหาย
// sharp ใช้ไม่ได้ / รูปเสีย → ส่งรูปเดิมตามปกติ (ไม่ทำให้งานล้ม)
// ============================================================

const MAX_EDGE = 1600; // ขอบยาวสุดของแต่ละรูปที่ส่ง (โมเดลย่อเกินนี้อยู่แล้ว)
const OVERLAP = 0.1;
/** หน้ามากกว่านี้ไม่ซูม (คุมจำนวนรูป/ค่าใช้จ่ายของเอกสารยาว) */
const MAX_PAGES_TO_TILE = 4;

export async function tileForReading(pages: ImageInput[]): Promise<ImageInput[]> {
  let sharp: typeof import("sharp").default;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return pages.map((p, i) => ({ ...p, label: pages.length > 1 ? `หน้า ${i + 1}` : undefined }));
  }
  const tile = pages.length <= MAX_PAGES_TO_TILE;
  const out: ImageInput[] = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const pageName = pages.length > 1 ? `หน้า ${i + 1}` : "เอกสาร";
    try {
      // หมุนตาม EXIF ก่อน (รูปถ่ายจากมือถือ) แล้วใช้รูปที่หมุนแล้วเป็นต้นฉบับ → ขนาด/การตัดตรงกับที่เห็นจริง
      const { data: buf, info } = await sharp(Buffer.from(p.base64, "base64"), { failOn: "none" })
        .rotate().png().toBuffer({ resolveWithObject: true });
      const w0 = info.width;
      const h0 = info.height;
      if (!w0 || !h0) throw new Error("no size");
      const jpeg = (s: ReturnType<typeof sharp>) => s.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      const fit = { width: MAX_EDGE, height: MAX_EDGE, fit: "inside" as const, withoutEnlargement: true };

      const whole = await jpeg(sharp(buf).resize(fit));
      out.push({ base64: whole.toString("base64"), mediaType: "image/jpeg", label: `${pageName} — ทั้งหน้า (ใช้ดูโครงสร้าง ลำดับ และชนิดช่อง)` });

      // ซูมเฉพาะหน้าแนวตั้งที่สูงพอ (กระดาษ A4/ใบฟอร์มทั่วไป) — รูปเล็ก/แนวนอนอ่านชัดอยู่แล้ว
      if (!tile || h0 < w0 * 1.15 || h0 < 1400) continue;
      const half = Math.ceil(h0 / 2);
      const ov = Math.round(h0 * OVERLAP / 2);
      const parts = [
        { top: 0, height: Math.min(h0, half + ov), name: "ครึ่งบน" },
        { top: Math.max(0, half - ov), height: h0 - Math.max(0, half - ov), name: "ครึ่งล่าง" },
      ];
      for (const part of parts) {
        const b = await jpeg(sharp(buf).extract({ left: 0, top: part.top, width: w0, height: part.height }).resize(fit));
        out.push({ base64: b.toString("base64"), mediaType: "image/jpeg", label: `${pageName} — ${part.name} แบบขยาย (ใช้อ่านตัวหนังสือให้ถูกต้อง)` });
      }
    } catch {
      out.push({ ...p, label: pages.length > 1 ? pageName : undefined });
    }
  }
  return out;
}
