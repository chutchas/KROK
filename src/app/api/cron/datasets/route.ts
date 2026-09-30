import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { runPull } from "@/lib/datasets-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// sync dataset แบบ API pull ที่ถึงเวลา
//
// เรียกทุก 5–15 นาทีจากตัวตั้งเวลาภายนอก พร้อม header
//   Authorization: Bearer <CRON_SECRET>
// - Vercel: ตั้ง env CRON_SECRET และเพิ่ม crons ใน vercel.json (ดู DEPLOY-AWS.md) — Vercel ใส่ header ให้เอง
// - AWS: EventBridge Scheduler → API destination (ดู DEPLOY-AWS.md)
//
// ทำครั้งละไม่เกิน 10 ชุดและไม่เกิน ~4 นาที ที่เหลือรอรอบถัดไป
// ============================================================

const MAX_PER_RUN = 10;
const TIME_BUDGET_MS = 240_000;

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

  const started = Date.now();
  const nowIso = new Date().toISOString();
  const { data: due, error } = await admin
    .from("datasets")
    .select("id")
    .eq("source_kind", "api_pull")
    .gt("schedule_minutes", 0)
    .lte("next_sync_at", nowIso)
    .order("next_sync_at", { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { id: string; ok: boolean; rows?: number; error?: string }[] = [];
  for (const d of (due || []) as { id: string }[]) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    // จองงานแบบ atomic: เลื่อน next_sync_at ออกไปก่อน — cron ที่ทำงานซ้อนกันจะไม่หยิบชุดเดียวกัน
    // (runPull ตั้ง next_sync_at ตามรอบจริงอีกครั้ง)
    const { data: claimed } = await admin
      .from("datasets")
      .update({ next_sync_at: new Date(Date.now() + 10 * 60000).toISOString() })
      .eq("id", d.id)
      .lte("next_sync_at", nowIso)
      .neq("last_sync_status", "running")
      .select("id");
    if (!claimed || claimed.length === 0) continue;
    const r = await runPull(admin, d.id, "schedule");
    results.push("error" in r ? { id: d.id, ok: false, error: r.error } : { id: d.id, ok: true, rows: r.rows });
  }
  return NextResponse.json({ ok: true, ran: results.length, results });
}

export const GET = handle;
export const POST = handle;
