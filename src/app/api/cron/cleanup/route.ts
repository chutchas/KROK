import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// งานเก็บกวาดตามเวลา (วันละครั้งพอ) — Authorization: Bearer <CRON_SECRET>
// - ลบแบบร่างการกรอกฟอร์มที่หมดอายุ (เกิน 30 วันหลังแก้ไขล่าสุด) พร้อมไฟล์ใน bucket 'drafts'
//   (หน้าแบบร่างก็ลบร่างหมดอายุของผู้ใช้เองอยู่แล้ว งานนี้เก็บของคนที่ไม่กลับมาเปิด)
// ============================================================

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) return false;
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });

  let drafts = 0;
  let files = 0;
  for (let round = 0; round < 20; round++) {
    const { data, error } = await admin
      .from("submission_drafts")
      .select("id, media")
      .lt("expires_at", new Date().toISOString())
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    const paths = (data as { media: Record<string, string> }[]).flatMap((d) => Object.values(d.media || {}));
    if (paths.length) {
      await admin.storage.from("drafts").remove(paths);
      files += paths.length;
    }
    await admin.from("submission_drafts").delete().in("id", (data as { id: string }[]).map((d) => d.id));
    drafts += data.length;
    if (data.length < 200) break;
  }
  return NextResponse.json({ ok: true, drafts, files });
}

export const GET = handle;
export const POST = handle;
