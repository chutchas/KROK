import { NextResponse } from "next/server";
import { isRowPhotoKey } from "@/lib/table-rows";
import { getAdminClient } from "@/lib/supabase/admin";
import { dispatchWebhooks } from "@/lib/webhooks";
import { dispatchNotifications } from "@/lib/notify";
import { maxPhotosOf, parsePhotoSlotKey } from "@/lib/photo-slots";
import { sanitizeSchema } from "@/lib/form-schema";
import { sanitizePublicAnswers } from "@/lib/public-answers";
import { runLater } from "@/lib/background";
import { clientIp, sniffImage } from "@/lib/client-ip";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 40 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 4;

// รับการส่งฟอร์มสาธารณะ (ไม่ต้อง login) — ตรวจว่าเป็นฟอร์ม public จริงก่อนบันทึกด้วย service role
export async function POST(req: Request) {
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "server not configured" }, { status: 500 });

  // กันส่งก้อนใหญ่ผิดปกติ (อ่าน formData ทั้งก้อนเข้าหน่วยความจำ)
  // ต้องบอกขนาดมาก่อน (คำขอแบบ chunked ไม่มี content-length จะข้ามการตรวจขนาดได้) — เบราว์เซอร์ส่ง FormData พร้อมขนาดเสมอ
  const lenHeader = req.headers.get("content-length");
  if (!lenHeader) return NextResponse.json({ error: "length required" }, { status: 411 });
  const len = Number(lenHeader) || 0;
  if (len > MAX_BODY_BYTES) return NextResponse.json({ error: "ข้อมูลใหญ่เกินไป" }, { status: 413 });

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
    .select("id, tenant_id, title, icon, version, schema, requires_approval, approval_chain, visibility, status, deleted_at")
    .eq("id", formId)
    .maybeSingle();

  if (!f || f.visibility !== "public" || f.status !== "published" || f.deleted_at) {
    return NextResponse.json({ error: "ฟอร์มนี้ไม่เปิดให้กรอกแบบสาธารณะ" }, { status: 403 });
  }

  // กันสแปมระดับ IP (atomic ผ่าน Postgres) — 20 ครั้ง/60 วินาทีต่อ IP ต่อฟอร์ม
  // best-effort: ถ้ายังไม่ได้รัน migration 0016 (ไม่มีฟังก์ชัน) จะข้ามไปใช้ backstop ต่อฟอร์มด้านล่าง
  const ip = clientIp(req);
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

  // เพดานต่อวันต่อฟอร์ม: คนนอกยิงถล่มจนโควตารายเดือนของทั้ง workspace หมดไม่ได้
  const dailyLimit = Math.max(1, Number(process.env.PUBLIC_FORM_DAILY_LIMIT) || 500);
  try {
    const bkk = new Date(Date.now() + 7 * 3600_000);
    const dayStart = new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate()) - 7 * 3600_000).toISOString();
    const { count } = await admin
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("form_id", f.id)
      .is("submitted_by", null)
      .gte("submitted_at", dayStart);
    if ((count ?? 0) >= dailyLimit) {
      return NextResponse.json({ error: "ฟอร์มนี้รับข้อมูลครบจำนวนของวันนี้แล้ว โปรดลองใหม่พรุ่งนี้" }, { status: 429 });
    }
  } catch { /* นับไม่ได้ → ไม่บล็อก */ }

  // CAPTCHA (Cloudflare Turnstile) — เปิดเมื่อตั้งค่า TURNSTILE_SECRET_KEY
  if (!(await turnstileOk(String(form.get("cf_token") || ""), ip))) {
    return NextResponse.json({ error: "ยืนยันว่าไม่ใช่บอทไม่สำเร็จ — โปรดลองกดส่งอีกครั้ง", captcha: true }, { status: 403 });
  }

  const userName = String(form.get("user_name") || "").trim().slice(0, 120) || "ผู้ไม่ระบุชื่อ";
  let duration = parseInt(String(form.get("duration") || "0"), 10) || 0;
  if (duration < 0) duration = 0;
  if (duration > 86400) duration = 86400; // ตัดค่าที่ผิดปกติ

  // รูป/ลายเซ็นที่รับ: เฉพาะช่องชนิด photo/signature ที่มีอยู่จริงในฟอร์ม, ไม่เกิน 40 ไฟล์, ไฟล์ละ ≤ 4MB
  let schema;
  try { schema = sanitizeSchema(f.schema); } catch { return NextResponse.json({ error: "ฟอร์มไม่ถูกต้อง" }, { status: 500 }); }
  const mediaFields = new Set(schema.steps.flatMap((st) => st.fields.filter((x) => x.type === "photo" || x.type === "signature").map((x) => x.id)));
  // รูปถ่ายต่อแถวของตาราง: key = <tableId>.<colId>.<สุ่ม> และคอลัมน์ต้องเป็นชนิดรูปถ่ายจริง
  const photoCols = new Set(schema.steps.flatMap((st) => st.fields.filter((x) => x.type === "table").flatMap((x) => (x.columns || []).filter((c) => c.type === "photo").map((c) => `${x.id}.${c.id}`))));
  // ฟิลด์รูปหลายรูป: ช่องที่ 2.. = <fieldId>.ph.slotNN และต้องไม่เกินจำนวนรูปสูงสุดที่ตั้งไว้
  const multiPhoto = new Map(schema.steps.flatMap((st) => st.fields.filter((x) => x.type === "photo").map((x) => [x.id, maxPhotosOf(x)] as const)));
  const slotOk = (k: string) => { const p = parsePhotoSlotKey(k); return !!p && p.slot > 0 && p.slot < (multiPhoto.get(p.fieldId) ?? 1); };
  const allowedMedia = (k: string) => mediaFields.has(k) || slotOk(k) || (isRowPhotoKey(k) && photoCols.has(k.split(".").slice(0, 2).join(".")));
  const MAX_PHOTOS = 60;
  const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4MB/ไฟล์
  const photos: { fieldId: string; file: File }[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("photo_") || !(value instanceof File)) continue;
    const fieldId = key.slice("photo_".length);
    if (!allowedMedia(fieldId) || value.size > MAX_PHOTO_BYTES || photos.some((p) => p.fieldId === fieldId)) continue;
    photos.push({ fieldId, file: value });
    if (photos.length >= MAX_PHOTOS) break;
  }

  // ไม่เชื่อคำตอบ/ผลจาก client: กรองตาม schema + คำนวณไม่ผ่านใหม่ฝั่ง server
  let rawAnswers: unknown = [];
  try { rawAnswers = JSON.parse(String(form.get("answers") || "[]")); } catch { /* keep [] */ }
  const { answers, fails, result } = sanitizePublicAnswers(schema, rawAnswers, new Set(photos.map((p) => p.fieldId)));

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
  if (subErr) {
    // ไม่ส่งข้อความ error ดิบของฐานข้อมูลให้คนนอก (ยกเว้นข้อความโควตาที่ตั้งใจให้เห็น)
    if (/\[quota:[a-z_]+\]/.test(subErr.message)) return NextResponse.json({ error: subErr.message.replace(/\s*\[quota:[a-z_]+\]/, "") }, { status: 429 });
    console.error("[krok] public submit failed:", subErr.message);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ โปรดลองใหม่" }, { status: 500 });
  }

  // audit: บันทึกการส่งฟอร์มสาธารณะ (ให้ Platform Admin ตรวจย้อนหลังได้)
  await admin.from("audit_log").insert({
    tenant_id: f.tenant_id,
    actor_id: null,
    action: "submission.create",
    target_type: "form",
    target_id: f.id,
    meta: { submission_id: subId, result, source: "public", user_name: userName },
  });

  // อัปโหลดรูป/ลายเซ็น (คัดไว้แล้วด้านบน) — ทีละ 4 ไฟล์พร้อมกัน · ไฟล์ที่ไม่ใช่รูปจริง (ดู magic bytes) ข้าม
  const saved: { tenant_id: string; submission_id: string; field_id: string; storage_path: string; ai_check: null }[] = [];
  for (let i = 0; i < photos.length; i += UPLOAD_CONCURRENCY) {
    await Promise.all(photos.slice(i, i + UPLOAD_CONCURRENCY).map(async ({ fieldId, file: value }) => {
      const buf = Buffer.from(await value.arrayBuffer());
      const type = sniffImage(buf);
      if (!type) return;
      const path = `${f.tenant_id}/${subId}/${fieldId}.jpg`;
      const { error: upErr } = await admin.storage
        .from("submissions")
        .upload(path, buf, { contentType: type, upsert: true });
      if (!upErr) saved.push({ tenant_id: f.tenant_id, submission_id: subId, field_id: fieldId, storage_path: path, ai_check: null });
    }));
  }
  if (saved.length) await admin.from("submission_photos").insert(saved);

  // แจ้ง webhook (best-effort)
  runLater(() => dispatchWebhooks(f.tenant_id, "submission.created", {
      submission_id: subId, id: subId, form_id: f.id, form_title: f.title, result, fails, answers, user_name: userName, submitted_at: new Date().toISOString(), source: "public",
    }, f.id));

  // แจ้งเตือน LINE/Email (best-effort) — ฟอร์มสาธารณะที่ถูกส่งรัว ๆ (>20 ใบ/ชม.) หยุดแจ้งชั่วคราว
  // กันเผาโควตาข้อความ LINE OA / สแปมผู้ติดตาม (ยังดูรายการได้ในแดชบอร์ดตามปกติ)
  let flood = false;
  try {
    const { count } = await admin.from("submissions").select("id", { count: "exact", head: true })
      .eq("form_id", f.id).is("submitted_by", null).gte("submitted_at", new Date(Date.now() - 3600_000).toISOString());
    flood = (count ?? 0) > 20;
  } catch { /* นับไม่ได้ → แจ้งตามปกติ */ }
  if (!flood) runLater(() => dispatchNotifications(f.tenant_id, "submission.created", {
      formTitle: f.title as string,
      formIcon: f.icon as string,
      userName,
      result,
      failCount: Array.isArray(fails) ? fails.length : 0,
      submissionId: subId,
    }));

  return NextResponse.json({ ok: true, id: subId });
}

/** ตรวจ token ของ Cloudflare Turnstile — ไม่ได้ตั้ง secret = ปิด CAPTCHA (ผ่านเสมอ) */
async function turnstileOk(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (!token || token.length > 4096) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean };
    return j.success === true;
  } catch {
    return false;
  }
}
