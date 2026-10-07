import { clientIp } from "@/lib/client-ip";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { resolveFormOptions } from "@/lib/datasets-server";
import { INTAKE_API_KEY_RE, coerceIntake, intakeFields, missingRequired } from "@/lib/intake";
import { intakeAllowed } from "@/lib/quota";
import { createIntakeCase, createIntakeSubmission, hashIntakeKey, type IntakeForm } from "@/lib/intake-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// API รับข้อมูลเข้า: ระบบภายนอกยิงค่ามาเติมฟอร์ม
//
//   POST /api/v1/forms/{formId}/intake
//   Authorization: Bearer kfi_xxxxxxxx
//   {
//     "data":   { "po_no": "PO-7781", "supplier": "B02", "qty": 120 },
//     "ref":    "ERP-000123",        // ไม่บังคับ — ยิงซ้ำด้วย ref เดิมจะไม่สร้างซ้ำ
//     "mode":   "auto",              // auto (default) | submit | job
//     "source": "ERP"                // ชื่อระบบที่ส่ง (แสดงเป็นผู้กรอก)
//   }
//   mode=auto   ครบทุกช่องบังคับ → เอกสาร, ไม่ครบ → เปิดงานให้คนกรอกต่อ
//   mode=submit ต้องครบ ไม่ครบตอบ 422
//   mode=job    เปิดงานเสมอ (ให้คนตรวจ/กรอกเพิ่มก่อนส่ง)
//
//   GET  /api/v1/forms/{formId}/intake → รายการ key ที่รับ (ใช้ทดสอบ API key)
// ============================================================

type Admin = NonNullable<ReturnType<typeof getAdminClient>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 512 * 1024;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const PLAN_OFF = { error: "แพ็กเกจปัจจุบันขององค์กรไม่รวม API รับข้อมูล (หรือเกินจำนวนฟอร์มที่แพ็กเกจรองรับ) — ให้ผู้ดูแลอัปเกรดแพ็กเกจในหน้า แพ็กเกจและการชำระเงิน", code: "plan_not_included" };
const DISABLED = { error: "API รับข้อมูลของฟอร์มนี้ถูกปิดอยู่ — ให้ผู้ดูแลเปิดในหน้า การเชื่อมต่อ › API รับข้อมูล", code: "intake_disabled" };

async function authenticate(req: Request, formId: string, admin: Admin) {
  const auth = req.headers.get("authorization") || "";
  const key = auth.replace(/^Bearer\s+/i, "").trim() || req.headers.get("x-api-key") || "";
  if (!INTAKE_API_KEY_RE.test(key) || !UUID.test(formId)) return null;
  const { data: cfg } = await admin
    .from("form_intake")
    .select("*")
    .eq("form_id", formId)
    .eq("key_hash", hashIntakeKey(key))
    .maybeSingle();
  if (!cfg) return null;
  // key ถูกต้องแต่ผู้ดูแลปิด API ไว้ → บอกให้ชัด (ผู้ถือ key ถูกต้องแล้ว จึงไม่เผยข้อมูลเพิ่ม)
  if (!cfg.enabled) return "disabled" as const;
  // key หมดอายุ (null/ไม่มีคอลัมน์ = ไม่หมดอายุ)
  const exp = (cfg as { key_expires_at?: string | null }).key_expires_at;
  if (exp && new Date(exp).getTime() <= Date.now()) return "expired" as const;
  const { data: f } = await admin
    .from("forms")
    .select("id, tenant_id, title, icon, version, schema, requires_approval, approval_chain, status, deleted_at")
    .eq("id", formId)
    .maybeSingle();
  if (!f || f.tenant_id !== cfg.tenant_id || f.deleted_at) return null;
  // แพ็กเกจปัจจุบันไม่รวม (เช่น ลดแพ็กเกจแล้วหมดรอบ) → ปฏิเสธพร้อมบอกเหตุผล
  if (!(await intakeAllowed(f.tenant_id as string, formId).catch(() => true))) return "plan" as const;
  return { cfg, f };
}

async function loadSchema(admin: Admin, raw: unknown, tenantId: string): Promise<FormSchema> {
  let schema = sanitizeSchema(raw);
  try { schema = await resolveFormOptions(schema, admin, tenantId); } catch { /* ใช้ตัวเลือกที่พิมพ์ไว้ */ }
  return schema;
}

async function rateLimited(admin: Admin, key: string, max = 120): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: 60 });
    return !error && data === false;
  } catch {
    return false;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdminClient();
  if (!admin) return json({ error: "server not configured" }, 500);
  const { id } = await params;
  // GET ไม่ได้บันทึกอะไร แต่ต้องคุมความถี่ (ทั้งต่อ IP — กันเดา/ยิงถล่ม — และต่อฟอร์ม)
  if (await rateLimited(admin, `intake-get-ip:${clientIp(req)}`, 60) || await rateLimited(admin, `intake-get:${id}`, 120))
    return json({ error: "เรียกถี่เกินไป (สูงสุด 60 ครั้ง/นาที)" }, 429);
  const a = await authenticate(req, id, admin);
  if (a === "disabled") return json(DISABLED, 403);
  if (a === "plan") return json(PLAN_OFF, 403);
  if (a === "expired") return json({ error: "API key หมดอายุแล้ว — ให้ผู้ดูแลสร้าง key ใหม่หรือต่ออายุ", code: "key_expired" }, 401);
  if (!a) return json({ error: "unauthorized" }, 401);
  const schema = await loadSchema(admin, a.f.schema, a.f.tenant_id);
  const keys = (a.cfg.field_keys as Record<string, string>) || {};
  return json({
    form: { id: a.f.id, title: a.f.title, status: a.f.status },
    fields: intakeFields(schema, keys).map((x) => ({
      key: x.key, label: x.label, type: x.type, required: x.required, accepts_api: x.accepts, step: x.step + 1,
      ...(x.unit ? { unit: x.unit } : {}), ...(x.options ? { options: x.options } : {}), ...(x.columns ? { columns: x.columns } : {}),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdminClient();
  if (!admin) return json({ error: "server not configured" }, 500);
  const { id } = await params;
  const a = await authenticate(req, id, admin);
  if (a === "disabled") return json(DISABLED, 403);
  if (a === "plan") return json(PLAN_OFF, 403);
  if (a === "expired") return json({ error: "API key หมดอายุแล้ว — ให้ผู้ดูแลสร้าง key ใหม่หรือต่ออายุ", code: "key_expired" }, 401);
  if (!a) return json({ error: "unauthorized" }, 401);
  if (a.f.status !== "published") return json({ error: "ฟอร์มนี้ยังไม่เผยแพร่" }, 409);
  if (await rateLimited(admin, `intake:${id}`)) return json({ error: "ส่งถี่เกินไป (สูงสุด 120 ครั้ง/นาที)" }, 429);

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY) return json({ error: "payload ใหญ่เกิน 512KB" }, 413);
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: "payload ใหญ่เกิน 512KB" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "body ต้องเป็น JSON" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "body ต้องเป็น JSON object" }, 400);

  const mode = body.mode === "submit" || body.mode === "job" ? body.mode : "auto";
  const ref = typeof body.ref === "string" && body.ref.trim() ? body.ref.trim().slice(0, 120) : null;
  const sourceName = (typeof body.source === "string" && body.source.trim() ? body.source.trim() : "ระบบภายนอก").slice(0, 60);

  // ยิงซ้ำด้วย ref เดิม → คืนของเดิม ไม่สร้างใหม่
  if (ref) {
    const [{ data: s }, { data: c }] = await Promise.all([
      admin.from("submissions").select("id").eq("form_id", id).eq("ext_ref", ref).maybeSingle(),
      admin.from("form_cases").select("id, status, submission_id").eq("form_id", id).eq("ext_ref", ref).maybeSingle(),
    ]);
    if (s) return json({ ok: true, duplicate: true, type: "submission", id: s.id, ref });
    if (c) return json({ ok: true, duplicate: true, type: "job", id: c.id, status: c.status, submission_id: c.submission_id ?? null, ref });
  }

  const schema = await loadSchema(admin, a.f.schema, a.f.tenant_id);
  const keys = (a.cfg.field_keys as Record<string, string>) || {};
  const co = coerceIntake(schema, keys, body.data);
  if (co.errors.length) return json({ error: "ค่าบางช่องไม่ถูกต้อง", details: co.errors, ignored: co.ignored }, 422);

  const fieldKey = (fid: string) => keys[fid] || fid;
  const missing = missingRequired(schema, co.answers).map((f) => ({ key: fieldKey(f.id), label: f.label, type: f.type }));
  if (mode === "submit" && missing.length) return json({ error: "ยังขาดช่องบังคับ", missing, ignored: co.ignored }, 422);

  const form: IntakeForm = {
    id: a.f.id as string,
    tenant_id: a.f.tenant_id as string,
    title: a.f.title as string,
    icon: (a.f.icon as string) || "📋",
    version: (a.f.version as number) ?? 1,
    requires_approval: !!a.f.requires_approval,
    approval_chain: (a.f.approval_chain as unknown[]) || [],
    rawSchema: a.f.schema,
  };
  await admin.from("form_intake").update({ last_used_at: new Date().toISOString() }).eq("form_id", id);

  if (mode === "submit" || (mode === "auto" && missing.length === 0)) {
    const r = await createIntakeSubmission(admin, form, schema, co.answers, { ref, sourceName });
    if ("error" in r) return r.duplicate ? json({ ok: true, duplicate: true, type: "submission", ref }) : json({ error: r.error }, 500);
    return json({ ok: true, type: "submission", id: r.id, ref, ignored: co.ignored }, 201);
  }

  const assignee = (a.cfg.assignee as { team_id?: string; user_id?: string } | null) ?? null;
  const r = await createIntakeCase(admin, form, schema, co.answers, { ref, sourceName, assignee });
  if ("error" in r) {
    if (r.duplicate) return json({ ok: true, duplicate: true, type: "job", ref });
    if (/form_cases|ext_ref/.test(r.error)) return json({ error: "ยังไม่ได้เปิดใช้การเปิดงานจาก API (ต้องรัน migration 0033 และ 0034)" }, 501);
    return json({ error: r.error }, 500);
  }
  return json({ ok: true, type: "job", id: r.id, ref, missing, assigned_to: r.holder ?? (r.team ? `ทีม ${r.team}` : "ผู้ดูแล"), ignored: co.ignored }, 201);
}
