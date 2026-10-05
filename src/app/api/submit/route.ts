import { NextResponse } from "next/server";
import { clampFilledAt } from "@/lib/filled-at";
import { createHash } from "crypto";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { sanitizePublicAnswers } from "@/lib/public-answers";
import { rateLimited } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import { sanitizeChain } from "@/lib/approval";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// ส่งฟอร์ม (ผู้ใช้ที่ล็อกอิน) — แทนการ insert ตรงจากเบราว์เซอร์ (0057 ปิดสิทธิ์นั้นแล้ว)
//   1) เบราว์เซอร์อัปโหลดรูปไป submissions/<tenant>/<subId>/ ก่อน (storage RLS: ใบที่ส่งแล้วเพิ่มไฟล์ไม่ได้)
//   2) เรียก route นี้: ตรวจสิทธิ์ฟอร์ม/งาน · พิสูจน์เครื่องด้วย device key จริง · คำนวณผล ผ่าน/ไม่ผ่าน ใหม่
//      จากคำตอบ + ไฟล์ที่อัปโหลดจริง แล้วบันทึกด้วย service role
// สถานะตอบกลับ: 200 สำเร็จ/เคยส่งแล้ว · 4xx = ส่งซ้ำก็ไม่ผ่าน (permanent) · 5xx = ลองใหม่ได้
// ============================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 4 * 1024 * 1024;

interface Body {
  subId?: unknown;
  tenantId?: unknown;
  version?: unknown;
  formId?: unknown;
  caseId?: unknown;
  answers?: unknown;
  dur?: unknown;
  deviceKey?: unknown;
  photos?: unknown;
  docExtracts?: unknown;
  offline?: unknown;
  filledAt?: unknown;
}

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return fail(401, "unauthorized");
  const admin = getAdminClient();
  if (!admin) return fail(503, "ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY");

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY) return fail(413, "ข้อมูลใหญ่เกินไป");
  let body: Body;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return fail(413, "ข้อมูลใหญ่เกินไป");
    body = JSON.parse(text) as Body;
  } catch {
    return fail(400, "bad request");
  }

  const subId = typeof body.subId === "string" && UUID.test(body.subId) ? body.subId : null;
  const formId = typeof body.formId === "string" && UUID.test(body.formId) ? body.formId : null;
  const caseId = typeof body.caseId === "string" && UUID.test(body.caseId) ? body.caseId : null;
  if (!subId || !formId) return fail(400, "bad request");

  // workspace ของใบนี้ (คิวออฟไลน์อาจกรอกใน workspace อื่นก่อนสลับ) — ต้องเป็นสมาชิกจริง
  let tenantId = session.tenantId;
  if (typeof body.tenantId === "string" && UUID.test(body.tenantId) && body.tenantId !== session.tenantId) {
    const { data: mem } = await admin.from("memberships").select("tenant_id").eq("tenant_id", body.tenantId).eq("user_id", session.userId).maybeSingle();
    if (!mem) return fail(403, "คุณไม่ได้เป็นสมาชิกของ workspace ที่กรอกใบนี้แล้ว");
    tenantId = body.tenantId;
  }
  const folder = `${tenantId}/${subId}`;

  // กันสคริปต์ยิงรัว (คิวออฟไลน์ที่ค้างหลายใบยังผ่านได้สบาย)
  if (await rateLimited(`submit:${session.userId}`, 60, 60)) return fail(429, "ส่งถี่เกินไป โปรดลองใหม่อีกสักครู่");

  // เคยบันทึกแล้ว (เน็ตหลุดหลังบันทึก / คิวออฟไลน์ส่งซ้ำ) → ถือว่าสำเร็จ
  const { data: dup } = await admin.from("submissions").select("id, submitted_by, result, fails").eq("id", subId).maybeSingle();
  if (dup) {
    if (dup.submitted_by !== session.userId) return fail(409, "รหัสเอกสารซ้ำ");
    // รอบก่อนบันทึกใบสำเร็จแต่แถวรูปยังไม่ครบ (เน็ตหลุดกลางทาง) → เติมแถวรูปที่ขาด
    await backfillPhotos(admin, tenantId, subId, folder, body.photos);
    return NextResponse.json({ ok: true, duplicate: true, result: dup.result, fails: dup.fails });
  }

  // ฟอร์ม: อ่านด้วยสิทธิ์ผู้ใช้ (RLS = เห็นฟอร์มนี้ได้จริง)
  const supabase = await createClient();
  const { data: f } = await supabase
    .from("forms")
    .select("id, tenant_id, title, icon, version, schema, status, deleted_at, requires_approval, approval_chain, require_approved_device, device_scope")
    .eq("id", formId)
    .maybeSingle();
  if (!f || f.tenant_id !== tenantId) return fail(404, "ไม่พบฟอร์ม หรือไม่มีสิทธิ์กรอกฟอร์มนี้");

  let schemaRaw: unknown = f.schema;
  let version = (f.version as number) ?? 1;
  if (caseId) {
    // ขั้นสุดท้ายของงาน: ต้องเป็นผู้ถืองานอยู่ · ใช้ schema ณ ตอนเริ่มงาน
    const { data: c } = await admin
      .from("form_cases")
      .select("id, tenant_id, form_id, status, claimed_by, schema, form_version")
      .eq("id", caseId)
      .maybeSingle();
    if (!c || c.tenant_id !== tenantId || c.form_id !== formId) return fail(404, "ไม่พบงาน");
    if (c.status !== "open" || c.claimed_by !== session.userId) return fail(409, "งานนี้ไม่ได้อยู่กับคุณแล้ว");
    schemaRaw = c.schema;
    version = (c.form_version as number) ?? version;
  } else if (f.deleted_at || f.status !== "published") {
    return fail(409, "ฟอร์มนี้ปิดรับข้อมูลแล้ว");
  }

  let schema: FormSchema;
  try { schema = sanitizeSchema(schemaRaw); } catch { return fail(500, "ฟอร์มไม่ถูกต้อง"); }

  // เครื่องที่อนุมัติ: พิสูจน์ด้วย device key (เก็บแค่ sha256) — ไม่เชื่อ device_id จากเบราว์เซอร์
  let deviceId: string | null = null;
  const deviceKey = typeof body.deviceKey === "string" && body.deviceKey.length >= 24 && body.deviceKey.length <= 200 ? body.deviceKey : null;
  if (deviceKey) {
    const { data: d } = await admin
      .from("devices")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("key_hash", createHash("sha256").update(deviceKey).digest("hex"))
      .maybeSingle();
    if (d && d.status === "approved") deviceId = d.id as string;
  }
  if (f.require_approved_device) {
    if (!deviceId) return fail(403, "เครื่องนี้ยังไม่ได้รับอนุมัติให้กรอกฟอร์มนี้");
    if (f.device_scope === "selected") {
      const { data: link } = await admin.from("form_devices").select("device_id").eq("form_id", formId).eq("device_id", deviceId).maybeSingle();
      if (!link) return fail(403, "เครื่องนี้ไม่ได้รับอนุญาตสำหรับฟอร์มนี้");
    }
  }

  // ไฟล์ที่อัปโหลดมาจริง
  const names = await listNames(admin, folder);
  if (!names) return fail(503, "อ่านไฟล์แนบไม่สำเร็จ โปรดลองใหม่");
  const uploaded = photoKeysOf(names);

  // ไม่เชื่อผลจากเบราว์เซอร์: กรองคำตอบตาม schema + คำนวณ ผ่าน/ไม่ผ่าน ใหม่
  const { answers, fails, result } = sanitizePublicAnswers(schema, body.answers, uploaded);
  let dur = Math.round(Number(body.dur) || 0);
  if (dur < 0) dur = 0;
  if (dur > 30 * 86400) dur = 30 * 86400;

  const chain = f.requires_approval ? sanitizeChain(f.approval_chain) : [];
  // เวอร์ชันที่ผู้ใช้กรอกจริง (คิวออฟไลน์อาจกรอกก่อนฟอร์มถูกแก้) — ต้องไม่ใหม่กว่าปัจจุบัน
  const clientVer = Math.round(Number(body.version));
  if (!caseId && Number.isFinite(clientVer) && clientVer >= 1 && clientVer <= version) version = clientVer;
  const row: Record<string, unknown> = {
    id: subId,
    tenant_id: tenantId,
    form_id: formId,
    form_title: f.title,
    form_icon: f.icon,
    form_version: version,
    submitted_by: session.userId,
    user_name: session.displayName,
    result,
    fails,
    answers,
    duration_s: dur,
    device_id: deviceId,
    approval_status: f.requires_approval ? "pending" : "none",
    approval_chain: chain,
    approval_step: 0,
    approval_history: [],
    // เวลาที่กรอกจริงจากเครื่อง: รับเฉพาะใบที่เข้าคิวตอนออฟไลน์ (ใบออนไลน์ = เวลาของ server)
    filled_at: body.offline === true ? clampFilledAt(body.filledAt, Date.now()) : null,
  };
  let { error: insErr } = await admin.from("submissions").insert(row);
  // ยังไม่ได้รัน migration 0059 (ไม่มีคอลัมน์ filled_at) → บันทึกแบบเดิม
  if (insErr && (insErr.code === "PGRST204" || insErr.code === "42703") && /filled_at/.test(insErr.message)) {
    delete row.filled_at;
    ({ error: insErr } = await admin.from("submissions").insert(row));
  }
  if (insErr) {
    if (insErr.code === "23505") return NextResponse.json({ ok: true, duplicate: true, result, fails });
    // โควตาแพ็กเกจเต็ม: ข้อความมีแท็ก [quota:…] ให้หน้ากรอกแสดงตรง ๆ
    if (/\[quota:[a-z_]+\]/.test(insErr.message)) return fail(402, insErr.message, { quota: true });
    console.error("[krok] submit insert failed:", insErr.message);
    return fail(500, "บันทึกไม่สำเร็จ โปรดลองใหม่");
  }

  // แถวรูป: เฉพาะไฟล์ที่มีอยู่จริงในโฟลเดอร์ของใบนี้ (ล้ม = ส่งซ้ำแล้วเติมให้ที่ทาง duplicate)
  const photoRows = [...uploaded].map((k) => ({
    tenant_id: tenantId, submission_id: subId, field_id: k, storage_path: `${folder}/${k}.jpg`, ai_check: aiMap(body.photos).get(k) ?? null,
  }));
  if (photoRows.length) {
    const { error: phErr } = await admin.from("submission_photos").insert(photoRows);
    if (phErr) { console.error("[krok] submit photo rows failed:", phErr.message); return fail(500, "บันทึกรูปไม่สำเร็จ โปรดลองใหม่"); }
  }

  // หลักฐานการอ่านเอกสารด้วย AI: เฉพาะแหล่งที่มีในฟอร์ม · รูปต้นฉบับต้องอยู่ในโฟลเดอร์ของใบนี้
  const sources = new Set(schema.steps.flatMap((s) => (s.fill_sources ?? []).map((x) => x.id)));
  if (Array.isArray(body.docExtracts)) {
    const rows = (body.docExtracts.slice(0, 20) as { source_id?: unknown; raw?: unknown; accepted?: unknown }[])
      .filter((x) => typeof x?.source_id === "string" && sources.has(x.source_id))
      .map((x) => {
        const sid = x.source_id as string;
        return {
          tenant_id: tenantId,
          submission_id: subId,
          source_id: sid,
          storage_path: names.has(`doc_${sid}.jpg`) ? `${folder}/doc_${sid}.jpg` : null,
          raw: Array.isArray(x.raw) ? x.raw.slice(0, 200) : [],
          accepted: Array.isArray(x.accepted) ? x.accepted.slice(0, 200) : [],
          created_by: session.userId,
        };
      });
    if (rows.length) await admin.from("submission_doc_extracts").insert(rows);
  }

  await writeAudit({
    tenant_id: tenantId,
    actor_id: session.userId,
    action: "submission.create",
    target_type: "submission",
    target_id: subId,
    meta: { form_id: formId, result, fails: fails.length, offline: body.offline === true, case_id: caseId },
  });

  return NextResponse.json({ ok: true, result, fails });
}

async function listNames(admin: SupabaseClient, folder: string): Promise<Set<string> | null> {
  const { data, error } = await admin.storage.from("submissions").list(folder, { limit: 500 });
  if (error) return null;
  return new Set((data || []).map((o) => o.name));
}

/** key ของรูป/ลายเซ็นจากชื่อไฟล์ (<key>.jpg) — ไม่รวมรูปต้นฉบับเอกสาร doc_* */
const photoKeysOf = (names: Set<string>) => new Set([...names].filter((n) => n.endsWith(".jpg") && !n.startsWith("doc_")).map((n) => n.slice(0, -4)));

function aiMap(photos: unknown): Map<string, string> {
  const m = new Map<string, string>();
  if (Array.isArray(photos)) {
    for (const p of photos.slice(0, 200) as { fieldId?: unknown; ai?: unknown }[]) {
      if (typeof p?.fieldId === "string" && typeof p.ai === "string") m.set(p.fieldId, p.ai.slice(0, 2000));
    }
  }
  return m;
}

async function backfillPhotos(admin: SupabaseClient, tenantId: string, subId: string, folder: string, photos: unknown) {
  try {
    const names = await listNames(admin, folder);
    if (!names) return;
    const keys = photoKeysOf(names);
    if (!keys.size) return;
    const { data: have } = await admin.from("submission_photos").select("field_id").eq("submission_id", subId);
    const exists = new Set((have || []).map((r) => r.field_id as string));
    const ai = aiMap(photos);
    const rows = [...keys].filter((k) => !exists.has(k)).map((k) => ({
      tenant_id: tenantId, submission_id: subId, field_id: k, storage_path: `${folder}/${k}.jpg`, ai_check: ai.get(k) ?? null,
    }));
    if (rows.length) await admin.from("submission_photos").insert(rows);
  } catch { /* best-effort */ }
}
