import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { dispatchWebhooks } from "@/lib/webhooks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// รับการส่งฟอร์มสาธารณะ (ไม่ต้อง login) — ตรวจว่าเป็นฟอร์ม public จริงก่อนบันทึกด้วย service role
export async function POST(req: Request) {
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "server not configured" }, { status: 500 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const formId = String(form.get("form_id") || "");
  if (!formId) return NextResponse.json({ error: "missing form" }, { status: 400 });

  // ยืนยันว่าฟอร์มนี้เป็น public + เผยแพร่ + ไม่ถูกลบ
  const { data: f } = await admin
    .from("forms")
    .select("id, tenant_id, title, icon, version, requires_approval, approval_chain, visibility, status, deleted_at")
    .eq("id", formId)
    .maybeSingle();

  if (!f || f.visibility !== "public" || f.status !== "published" || f.deleted_at) {
    return NextResponse.json({ error: "ฟอร์มนี้ไม่เปิดให้กรอกแบบสาธารณะ" }, { status: 403 });
  }

  // กันสแปมระดับ IP (atomic ผ่าน Postgres) — 20 ครั้ง/60 วินาทีต่อ IP ต่อฟอร์ม
  // best-effort: ถ้ายังไม่ได้รัน migration 0016 (ไม่มีฟังก์ชัน) จะข้ามไปใช้ backstop ต่อฟอร์มด้านล่าง
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim())
    || req.headers.get("x-real-ip")
    || "unknown";
  try {
    const { data: allowed, error: rlErr } = await admin.rpc("hit_rate_limit", {
      p_key: `pubsubmit:${ip}:${f.id}`,
      p_max: 20,
      p_window_seconds: 60,
    });
    if (!rlErr && allowed === false) {
      return NextResponse.json({ error: "ส่งฟอร์มถี่เกินไป โปรดลองใหม่อีกสักครู่" }, { status: 429 });
    }
  } catch { /* ไม่มีฟังก์ชัน/ผิดพลาด → ไม่บล็อก ใช้ backstop ต่อฟอร์มแทน */ }

  // backstop: จำกัดจำนวนการส่งแบบไม่ล็อกอินต่อฟอร์มใน 60 วินาทีล่าสุด
  try {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("form_id", f.id)
      .is("submitted_by", null)
      .gte("submitted_at", since);
    if ((count ?? 0) >= 60) {
      return NextResponse.json({ error: "มีการส่งฟอร์มถี่เกินไป โปรดลองใหม่อีกสักครู่" }, { status: 429 });
    }
  } catch { /* ถ้านับไม่ได้ ไม่บล็อกการส่ง */ }

  const userName = String(form.get("user_name") || "").trim().slice(0, 120) || "ผู้ไม่ระบุชื่อ";
  const result = form.get("result") === "fail" ? "fail" : "pass";
  let duration = parseInt(String(form.get("duration") || "0"), 10) || 0;
  if (duration < 0) duration = 0;
  if (duration > 86400) duration = 86400; // ตัดค่าที่ผิดปกติ
  let fails: unknown[] = [];
  let answers: unknown[] = [];
  try { fails = JSON.parse(String(form.get("fails") || "[]")); } catch { /* keep [] */ }
  try { answers = JSON.parse(String(form.get("answers") || "[]")); } catch { /* keep [] */ }
  if (!Array.isArray(fails)) fails = [];
  if (!Array.isArray(answers)) answers = [];
  // จำกัดขนาด payload กัน DoS
  if (answers.length > 500) answers = answers.slice(0, 500);
  if (fails.length > 500) fails = fails.slice(0, 500);

  const subId = crypto.randomUUID();
  const { error: subErr } = await admin.from("submissions").insert({
    id: subId,
    tenant_id: f.tenant_id,
    form_id: f.id,
    form_title: f.title,
    form_icon: f.icon,
    form_version: f.version ?? 1,
    submitted_by: null,
    user_name: userName,
    result,
    fails,
    answers,
    duration_s: duration,
    approval_status: f.requires_approval ? "pending" : "none",
    approval_chain: f.requires_approval ? f.approval_chain : [],
    approval_step: 0,
    approval_history: [],
  });
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });

  // audit: บันทึกการส่งฟอร์มสาธารณะ (ให้ Platform Admin ตรวจย้อนหลังได้)
  await admin.from("audit_log").insert({
    tenant_id: f.tenant_id,
    actor_id: null,
    action: "submission.create",
    target_type: "form",
    target_id: f.id,
    meta: { submission_id: subId, result, source: "public", user_name: userName },
  });

  // อัปโหลดรูป/ลายเซ็น (ไฟล์ชื่อ photo_<fieldId>) — จำกัดจำนวนไฟล์และขนาดต่อไฟล์
  const MAX_PHOTOS = 40;
  const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4MB/ไฟล์
  let photoCount = 0;
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("photo_") || !(value instanceof File)) continue;
    if (++photoCount > MAX_PHOTOS) break;
    if (value.size > MAX_PHOTO_BYTES) continue;
    const fieldId = key.slice("photo_".length).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    if (!fieldId) continue;
    const path = `${f.tenant_id}/${subId}/${fieldId}.jpg`;
    const buf = Buffer.from(await value.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from("submissions")
      .upload(path, buf, { contentType: "image/jpeg", upsert: true });
    if (!upErr) {
      await admin.from("submission_photos").insert({
        tenant_id: f.tenant_id,
        submission_id: subId,
        field_id: fieldId,
        storage_path: path,
        ai_check: null,
      });
    }
  }

  // แจ้ง webhook (best-effort)
  try {
    await dispatchWebhooks(f.tenant_id, "submission.created", {
      id: subId, form_id: f.id, form_title: f.title, result, fails, answers, user_name: userName, submitted_at: new Date().toISOString(), source: "public",
    }, f.id);
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, id: subId });
}
