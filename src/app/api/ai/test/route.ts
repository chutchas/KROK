import { NextResponse } from "next/server";
import { getSession, canManage } from "@/lib/session";
import { pingModel } from "@/lib/ai";
import { isAiPurpose } from "@/lib/ai-purpose";

export const maxDuration = 60;

// ทดสอบว่าคีย์/provider ของ purpose นั้นเรียก LLM ได้จริง
// purpose ที่ต้อง vision จะถูกทดสอบด้วยรูป เพื่อจับกรณีตั้งรุ่นที่ไม่รองรับรูป
// ไม่หักเครดิต — เป็นการตั้งค่าระบบ ไม่ใช่การใช้งานของ workspace
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });

  let purpose = "form_gen";
  try {
    const body = await req.json();
    if (isAiPurpose(body?.purpose)) purpose = body.purpose;
  } catch {
    /* ไม่มี body = ทดสอบ form_gen ตามเดิม */
  }

  const result = await pingModel(purpose as Parameters<typeof pingModel>[0]);
  return NextResponse.json(result, { status: 200 });
}
