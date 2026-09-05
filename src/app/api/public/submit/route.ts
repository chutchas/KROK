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

  const userName = String(form.get("user_name") || "").trim().slice(0, 120) || "ผู้ไม่ระบุชื่อ";
  const result = form.get("result") === "fail" ? "fail" : "pass";
  const duration = parseInt(String(form.get("duration") || "0"), 10) || 0;
  let fails: unknown[] = [];
  let answers: unknown[] = [];
  try { fails = JSON.parse(String(form.get("fails") || "[]")); } catch { /* keep [] */ }
  try { answers = JSON.parse(String(form.get("answers") || "[]")); } catch { /* keep [] */ }
  if (!Array.isArray(fails)) fails = [];
  if (!Array.isArray(answers)) answers = [];

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

  // อัปโหลดรูป/ลายเซ็น (ไฟล์ชื่อ photo_<fieldId>)
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("photo_") || !(value instanceof File)) continue;
    const fieldId = key.slice("photo_".length);
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
      id: subId, form_id: f.id, form_title: f.title, result, fails, user_name: userName, submitted_at: new Date().toISOString(), source: "public",
    });
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, id: subId });
}
