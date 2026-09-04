import { NextResponse } from "next/server";
import { getSession, canManage } from "@/lib/session";
import { generateForm } from "@/lib/ai";

export const maxDuration = 60;

// ทดสอบว่าคีย์/provider ที่ตั้งไว้เรียก LLM ได้จริง
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });

  try {
    const schema = await generateForm(session.tenantId, "ทดสอบระบบ: ใบเช็คอินสั้นๆ 2-3 ช่อง");
    return NextResponse.json({ ok: true, title: schema.title });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "เรียก LLM ไม่สำเร็จ" },
      { status: 200 }
    );
  }
}
