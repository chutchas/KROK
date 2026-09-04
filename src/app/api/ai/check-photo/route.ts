import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { checkPhoto } from "@/lib/ai";
import { consumeAiCredit } from "@/lib/quota";

export const maxDuration = 60;

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    const hint = String(form.get("hint") || "");
    const label = String(form.get("label") || "");
    if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
    if (!ALLOWED.includes(file.type))
      return NextResponse.json({ error: "ชนิดไฟล์ไม่รองรับ" }, { status: 400 });

    const credit = await consumeAiCredit(session.tenantId);
    if (!credit.ok)
      return NextResponse.json(
        { error: `ใช้เครดิต AI ครบโควตาเดือนนี้แล้ว (${credit.used}/${credit.max})`, ok: true, pass: true, note: "" },
        { status: 402 }
      );

    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const result = await checkPhoto(session.tenantId, b64, file.type, hint, label);
    return NextResponse.json(result);
  } catch (e) {
    console.error("ai/check-photo", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ตรวจรูปไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
