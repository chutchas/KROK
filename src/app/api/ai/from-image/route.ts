import { NextResponse } from "next/server";
import { getSession, canManage } from "@/lib/session";
import { aiRateLimited } from "@/lib/rate-limit";
import { formFromImage } from "@/lib/ai";
import { consumeAiCredit } from "@/lib/quota";

export const maxDuration = 120;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await aiRateLimited(session.userId, "from_image"))
    return NextResponse.json({ error: "เรียกใช้ AI ถี่เกินไป — รอสักครู่แล้วลองใหม่" }, { status: 429 });
  if (!canManage(session.role))
    return NextResponse.json({ error: "ไม่มีสิทธิ์สร้างฟอร์ม" }, { status: 403 });

  try {
    const form = await req.formData();
    // รองรับหลายรูป (PDF หลายหน้า = หลายไฟล์) — เผื่อ back-compat กับ field "file" เดี่ยว
    const raw = [...form.getAll("file"), ...form.getAll("files")];
    const files = raw.filter((f): f is File => f instanceof File).slice(0, 6);
    if (files.length === 0) return NextResponse.json({ error: "no file" }, { status: 400 });
    let total = 0;
    for (const f of files) {
      if (!ALLOWED.includes(f.type))
        return NextResponse.json({ error: "ชนิดไฟล์ไม่รองรับ" }, { status: 400 });
      total += f.size;
      if (f.size > 8 * 1024 * 1024)
        return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 8MB" }, { status: 400 });
    }
    if (total > 20 * 1024 * 1024)
      return NextResponse.json({ error: "รวมไฟล์ใหญ่เกิน 20MB" }, { status: 400 });

    const credit = await consumeAiCredit(session.tenantId, "form_from_image");
    if (!credit.ok)
      return NextResponse.json(
        { error: `ใช้เครดิต “${credit.label}” ครบโควตาเดือนนี้แล้ว (${credit.used}/${credit.max}) — อัปเกรดแผนที่หน้า “แผน/โควตา”` },
        { status: 402 }
      );

    const images = await Promise.all(
      files.map(async (f) => ({ base64: Buffer.from(await f.arrayBuffer()).toString("base64"), mediaType: f.type }))
    );
    // ข้อความจริงจาก PDF (หน้าละ 1 สตริง) — ไม่มี/อ่านไม่ได้ = อ่านจากรูปอย่างเดียว
    let pdfText: string[] = [];
    try {
      const raw = JSON.parse(String(form.get("pdf_text") || "[]"));
      if (Array.isArray(raw)) pdfText = raw.slice(0, 6).map((t) => (typeof t === "string" ? t.slice(0, 8000) : ""));
    } catch { /* ignore */ }
    const schema = await formFromImage(images, pdfText, { tenantId: session.tenantId });
    return NextResponse.json({ schema });
  } catch (e) {
    console.error("ai/from-image", e);
    return NextResponse.json(
      { error: e instanceof Error && /[\u0E00-\u0E7F]/.test(e.message) ? e.message : "อ่านฟอร์มไม่สำเร็จ โปรดลองใหม่" },
      { status: 500 }
    );
  }
}
