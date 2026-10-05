import { sm } from "@/lib/server-msg";
import { NextResponse } from "next/server";
import { getSession, canManage } from "@/lib/session";
import { pingModel } from "@/lib/ai";
import { isAiPurpose } from "@/lib/ai-purpose";
import { rateLimited } from "@/lib/rate-limit";

export const maxDuration = 60;

// ทดสอบว่าคีย์/provider ของ purpose นั้นเรียก LLM ได้จริง
// purpose ที่ต้อง vision จะถูกทดสอบด้วยรูป เพื่อจับกรณีตั้งรุ่นที่ไม่รองรับรูป
// ไม่หักเครดิต — เป็นการตั้งค่าระบบ ไม่ใช่การใช้งานของ workspace
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const platformStaff = session.isPlatformAdmin || session.platformRole === "developer";
  if (!canManage(session.role) && !platformStaff) return NextResponse.json({ error: await sm("ไม่มีสิทธิ์") }, { status: 403 });
  // ไม่หักเครดิต → กันยิงรัวให้เสียค่า LLM ของระบบ: 6 ครั้ง/นาที/ผู้ใช้ (ผู้ดูแลระบบ 30)
  if (await rateLimited(`ai:test:${session.userId}`, platformStaff ? 30 : 6, 60))
    return NextResponse.json({ error: await sm("ทดสอบถี่เกินไป โปรดลองใหม่อีกสักครู่") }, { status: 429 });

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
