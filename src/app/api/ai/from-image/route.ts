import { NextResponse } from "next/server";
import { getSession, canManage } from "@/lib/session";
import { formFromImage } from "@/lib/ai";
import { consumeAiCredit } from "@/lib/quota";

export const maxDuration = 120;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(session.role))
    return NextResponse.json({ error: "ไม่มีสิทธิ์สร้างฟอร์ม" }, { status: 403 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
    if (!ALLOWED.includes(file.type))
      return NextResponse.json({ error: "ชนิดไฟล์ไม่รองรับ" }, { status: 400 });
    if (file.size > 8 * 1024 * 1024)
      return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 8MB" }, { status: 400 });

    const credit = await consumeAiCredit(session.tenantId);
    if (!credit.ok)
      return NextResponse.json(
        { error: `ใช้เครดิต AI ครบโควตาเดือนนี้แล้ว (${credit.used}/${credit.max}) — อัปเกรดแผนที่หน้า “แผน/โควตา”` },
        { status: 402 }
      );

    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const schema = await formFromImage(session.tenantId, b64, file.type);
    return NextResponse.json({ schema });
  } catch (e) {
    console.error("ai/from-image", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "อ่านฟอร์มไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
