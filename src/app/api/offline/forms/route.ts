import { NextResponse } from "next/server";
import { getSession, hasMenu } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { buildOfflineBundle } from "@/lib/offline-bundle";
import { rateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// ชุดฟอร์มสำหรับกรอกออฟไลน์ของผู้ใช้ที่ล็อกอินอยู่ (workspace ปัจจุบัน)
// ?v=<hash> เดิมยังตรง → ตอบ { same: true } ไม่ส่งเนื้อหาซ้ำ
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await rateLimited(`offline:bundle:${session.userId}`, 20, 600))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  if (!(await hasMenu(session, "forms")))
    return NextResponse.json({ same: false, bundle: null }, { headers: { "Cache-Control": "no-store" } });

  const supabase = await createClient();
  try {
    const bundle = await buildOfflineBundle(supabase, session);
    const v = new URL(req.url).searchParams.get("v");
    const res = v && v === bundle.hash ? { same: true } : { same: false, bundle };
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
}
