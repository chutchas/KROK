import { NextResponse } from "next/server";
import { withCronLog } from "@/lib/cron-log";
import { cronAuthorized } from "@/lib/cron-auth";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// งานเก็บกวาดตามเวลา (วันละครั้งพอ) — Authorization: Bearer <CRON_SECRET>
// - ลบแบบร่างการกรอกฟอร์มที่หมดอายุ (เกิน 30 วันหลังแก้ไขล่าสุด) พร้อมไฟล์ใน bucket 'drafts'
//   (หน้าแบบร่างก็ลบร่างหมดอายุของผู้ใช้เองอยู่แล้ว งานนี้เก็บของคนที่ไม่กลับมาเปิด)
// - แพ็กเกจเสียเงินที่หมดอายุเกินช่วงผ่อนผัน → Free + ลิงก์ชำระที่หมดอายุ → void (0046)
//   (สิทธิ์ใช้งานตัดเองอยู่แล้วตอนหมดอายุ งานนี้แค่เก็บข้อมูลให้ตรง)
// - เอกสารในถังขยะเกิน 30 วัน (0079) → ลบจริง พร้อมรูป/ลายเซ็น/เอกสารต้นฉบับที่ AI อ่านใน bucket 'submissions'
// ============================================================

const TRASH_DAYS = 30;

async function purgeTrash(admin: NonNullable<ReturnType<typeof getAdminClient>>): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86400_000).toISOString();
  let purged = 0;
  for (let round = 0; round < 20; round++) {
    const { data, error } = await admin.from("submissions").select("id").not("deleted_at", "is", null).lt("deleted_at", cutoff).limit(100);
    if (error || !data || data.length === 0) break; // ยังไม่รัน 0079 = ไม่มีคอลัมน์ → ข้าม
    const ids = (data as { id: string }[]).map((r) => r.id);
    const [{ data: ph }, { data: ex }] = await Promise.all([
      admin.from("submission_photos").select("storage_path").in("submission_id", ids),
      admin.from("submission_doc_extracts").select("storage_path").in("submission_id", ids),
    ]);
    const paths = [...(ph || []), ...(ex || [])].map((p) => (p as { storage_path: string | null }).storage_path).filter((p): p is string => !!p);
    for (let i = 0; i < paths.length; i += 500) await admin.storage.from("submissions").remove(paths.slice(i, i + 500));
    // แถวรูป/หลักฐาน/แจ้งเตือน ลบตาม (on delete cascade) · ลิงก์งาน/ฟอร์มลูก = null
    const { error: delErr } = await admin.from("submissions").delete().in("id", ids);
    if (delErr) break;
    purged += ids.length;
    if (data.length < 100) break;
  }
  return purged;
}

async function handle(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });

  let drafts = 0;
  let files = 0;
  for (let round = 0; round < 20; round++) {
    const { data, error } = await admin
      .from("submission_drafts")
      .select("id, tenant_id, user_id, media")
      .lt("expires_at", new Date().toISOString())
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    // ลบเฉพาะไฟล์ในโฟลเดอร์ของร่างนั้นจริง (<tenant>/<user>/<draft>/) — media เป็นค่าที่ client เขียนได้
    const paths = (data as { id: string; tenant_id: string; user_id: string; media: Record<string, unknown> }[]).flatMap((d) => {
      const prefix = `${d.tenant_id}/${d.user_id}/${d.id}/`;
      return Object.values(d.media || {}).filter((p): p is string => typeof p === "string" && p.startsWith(prefix) && !p.includes(".."));
    });
    if (paths.length) {
      await admin.storage.from("drafts").remove(paths);
      files += paths.length;
    }
    await admin.from("submission_drafts").delete().in("id", (data as { id: string }[]).map((d) => d.id));
    drafts += data.length;
    if (data.length < 200) break;
  }
  // บันทึก error เก่ากว่า 30 วัน (0053) — ยังไม่รัน = error เงียบ ๆ ข้ามไป
  await admin.from("error_events").delete().lt("created_at", new Date(Date.now() - 30 * 86400_000).toISOString());
  // ยังไม่รัน 0046 = ข้าม
  const { data: expired } = await admin.rpc("expire_account_plans");
  const purged = await purgeTrash(admin);
  return NextResponse.json({ ok: true, drafts, files, expiredPlans: typeof expired === "number" ? expired : 0, purgedSubmissions: purged });
}

const logged = withCronLog("cleanup", handle);
export const GET = logged;
export const POST = logged;
