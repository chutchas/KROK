import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { aiRateLimited } from "@/lib/rate-limit";
import { checkPhoto } from "@/lib/ai";
import { consumeAiCredit } from "@/lib/quota";

export const maxDuration = 60;

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await aiRateLimited(session.userId, "photo_check"))
    return NextResponse.json({ error: "เรียกใช้ AI ถี่เกินไป — รอสักครู่แล้วลองใหม่" }, { status: 429 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    // ข้อความไปต่อท้าย prompt — จำกัดความยาว (กันยัด prompt ยาว ๆ ให้เสียโทเคน)
    const hint = String(form.get("hint") || "").slice(0, 300);
    const label = String(form.get("label") || "").slice(0, 300);
    if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
    if (!ALLOWED.includes(file.type))
      return NextResponse.json({ error: "ชนิดไฟล์ไม่รองรับ" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "ไฟล์ใหญ่เกินไป (สูงสุด 8MB)" }, { status: 413 });

    const credit = await consumeAiCredit(session.tenantId, "photo_check");
    if (!credit.ok)
      return NextResponse.json(
        { error: `ใช้เครดิต “${credit.label}” ครบโควตาเดือนนี้แล้ว (${credit.used}/${credit.max})`, ok: true, pass: true, note: "" },
        { status: 402 }
      );

    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const result = await checkPhoto(b64, file.type, hint, label);
    return NextResponse.json(result);
  } catch (e) {
    console.error("ai/check-photo", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ตรวจรูปไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
