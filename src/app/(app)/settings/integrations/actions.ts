"use server";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";
import { testWebhook, type WebhookEvent } from "@/lib/webhooks";
import { sendLine, sendEmail } from "@/lib/notify";
import { getAdminClient } from "@/lib/supabase/admin";
import { smtpHostShapeOk, smtpPortAllowed, SMTP_PORTS } from "@/lib/notify-utils";
import { gateWebhookAdd, gateNotify, gateLocked } from "@/lib/quota";

// ความลับ (LINE token / SMTP password / webhook secret) อ่าน-เขียนผ่าน service role เท่านั้น (migration 0043 ปิด REST)
// ทุก action ตรวจ session + สิทธิ์ผู้จัดการ และผูก tenant_id เองก่อนเสมอ
const NO_ADMIN = "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY — ระบบเชื่อมต่อจึงใช้งานไม่ได้ (แจ้งผู้ดูแลระบบ)";

const EVENTS: WebhookEvent[] = ["submission.created", "submission.approved", "submission.rejected"];

function cleanEvents(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr.filter((e): e is string => typeof e === "string" && EVENTS.includes(e as WebhookEvent));
  return out.length ? Array.from(new Set(out)) : ["submission.created"];
}

function validUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

async function ownForm(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, formId?: string | null): Promise<string | null | false> {
  if (!formId) return null;
  const { data: f } = await supabase.from("forms").select("id").eq("id", formId).eq("tenant_id", tenantId).maybeSingle();
  return f ? formId : false;
}

function cleanFields(fields: unknown): string[] {
  return Array.isArray(fields)
    ? Array.from(new Set(fields.filter((x): x is string => typeof x === "string"))).slice(0, 200)
    : [];
}

export async function createWebhook(
  name: string,
  url: string,
  events: unknown,
  secret: string,
  formId?: string | null,
  fields?: unknown
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์") };
  if (!validUrl(url.trim())) return { error: await sm("URL ไม่ถูกต้อง (ต้องขึ้นต้น http:// หรือ https://)") };

  const admin = getAdminClient();
  if (!admin) return { error: NO_ADMIN };
  const supabase = await createClient();

  const gate = await gateWebhookAdd(session.tenantId);
  if (gate) return { error: gate };
  const form_id = await ownForm(supabase, session.tenantId, formId);
  if (form_id === false) return { error: await sm("ไม่พบฟอร์มที่เลือก") };
  const fieldIds = cleanFields(fields);

  const { error } = await admin.from("webhooks").insert({
    tenant_id: session.tenantId,
    name: name.trim().slice(0, 80) || "Webhook",
    url: url.trim(),
    events: cleanEvents(events),
    secret: secret.trim() ? secret.trim().slice(0, 200) : null,
    form_id,
    fields: fieldIds,
    created_by: session.userId,
  });
  if (error) return { error: await sm(dbError(error)) };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function toggleWebhook(id: string, active: boolean): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์") };
  const admin = getAdminClient();
  if (!admin) return { error: NO_ADMIN };
  if (active) { const gate = await gateLocked(session.tenantId, "webhook"); if (gate) return { error: gate }; }
  const { data, error } = await admin.from("webhooks").update({ active }).eq("id", id).eq("tenant_id", session.tenantId).select("id");
  if (!error && !data?.length) return { error: await sm("ไม่พบ webhook") };
  if (error) return { error: await sm(dbError(error)) };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function deleteWebhook(id: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์") };
  const admin = getAdminClient();
  if (!admin) return { error: NO_ADMIN };
  const { error } = await admin.from("webhooks").delete().eq("id", id).eq("tenant_id", session.tenantId);
  if (error) return { error: await sm(dbError(error)) };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

/** แก้ไข webhook — secret ว่าง = คงเดิม · clearSecret = ลบลายเซ็น */
export async function updateWebhook(
  id: string,
  input: { name: string; url: string; events: unknown; secret: string; clearSecret?: boolean; formId?: string | null; fields?: unknown }
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์") };
  if (!validUrl(input.url.trim())) return { error: await sm("URL ไม่ถูกต้อง (ต้องขึ้นต้น http:// หรือ https://)") };
  const locked = await gateLocked(session.tenantId, "webhook");
  if (locked) return { error: locked };
  const admin = getAdminClient();
  if (!admin) return { error: NO_ADMIN };
  const supabase = await createClient();
  const form_id = await ownForm(supabase, session.tenantId, input.formId);
  if (form_id === false) return { error: await sm("ไม่พบฟอร์มที่เลือก") };
  const patch: Record<string, unknown> = {
    name: input.name.trim().slice(0, 80) || "Webhook",
    url: input.url.trim(),
    events: cleanEvents(input.events),
    form_id,
    fields: form_id ? cleanFields(input.fields) : [],
  };
  if (input.secret.trim()) patch.secret = input.secret.trim().slice(0, 200);
  else if (input.clearSecret) patch.secret = null;
  const { data, error } = await admin.from("webhooks").update(patch).eq("id", id).eq("tenant_id", session.tenantId).select("id");
  if (error) return { error: await sm(dbError(error)) };
  if (!data?.length) return { error: await sm("ไม่พบ webhook") };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export interface DeliveryRow { id: string; event: string; status: number | null; ok: boolean; attempts: number; error: string | null; duration_ms: number | null; created_at: string }

/** ประวัติการส่งล่าสุดของ webhook (20 รายการ) — ยังไม่รัน 0043 = รายการว่าง */
export async function listDeliveries(webhookId: string): Promise<{ rows: DeliveryRow[] } | { error: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์") };
  const admin = getAdminClient();
  if (!admin) return { error: NO_ADMIN };
  const { data, error } = await admin
    .from("webhook_deliveries")
    .select("id, event, status, ok, attempts, error, duration_ms, created_at")
    .eq("webhook_id", webhookId)
    .eq("tenant_id", session.tenantId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return /webhook_deliveries/.test(error.message) ? { rows: [] } : { error: await sm(dbError(error)) };
  return { rows: (data || []) as DeliveryRow[] };
}

export async function testWebhookById(id: string): Promise<{ ok: boolean; status: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { ok: false, status: "unauthorized" };
  const locked = await gateLocked(session.tenantId, "webhook");
  if (locked) return { ok: false, status: locked };
  const admin = getAdminClient();
  if (!admin) return { ok: false, status: NO_ADMIN };
  const { data } = await admin
    .from("webhooks")
    .select("url, secret")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!data) return { ok: false, status: "not found" };
  const res = await testWebhook(data.url as string, (data.secret as string) ?? null);
  await admin
    .from("webhooks")
    .update({ last_status: `test ${res.status}`, last_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  revalidatePath("/settings/integrations");
  return res;
}

// ---------- การแจ้งเตือน LINE / Email (ต่อองค์กร, BYO) ----------

export interface NotifyInput {
  line_enabled: boolean;
  line_token: string; // "" = ไม่เปลี่ยนของเดิม
  line_target: string;
  line_broadcast?: boolean;
  email_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string; // "" = ไม่เปลี่ยนของเดิม
  email_from: string;
  email_to: string[];
  on_created: boolean;
  on_approved: boolean;
  on_rejected: boolean;
  fail_only: boolean;
  on_case?: boolean;
}

export async function saveNotify(input: NotifyInput): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { error: "unauthorized" };
  const locked = await gateLocked(session.tenantId, "notify"); // แพ็กเกจไม่รวม: ปิดได้อย่างเดียว (disableNotify)
  if (locked) return { error: locked };
  const admin = getAdminClient();
  if (!admin) return { error: NO_ADMIN };

  // ตรวจปลายทาง SMTP ตั้งแต่ตอนบันทึก (ตอนส่งจริงตรวจ DNS/IP ซ้ำอีกชั้น)
  const host = input.smtp_host?.trim() || "";
  const port = Number.isFinite(input.smtp_port) ? Math.round(input.smtp_port) : 0;
  if (host && !smtpHostShapeOk(host)) return { error: await sm("ชื่อโฮสต์ SMTP ไม่ถูกต้อง (ต้องเป็นโดเมน เช่น smtp.gmail.com)") };
  if ((host || input.email_enabled) && !smtpPortAllowed(port)) return { error: `พอร์ต SMTP ต้องเป็น ${SMTP_PORTS.join(" / ")}` };
  if (input.line_enabled && !input.line_target?.trim() && !input.line_broadcast)
    return { error: await sm("LINE: ใส่ userId/groupId ของผู้รับ หรือเลือก “ส่งถึงผู้ติดตามทั้งหมด”") };

  // อ่านของเดิมเพื่อคงค่า secret ถ้าผู้ใช้ไม่ได้กรอกใหม่
  const { data: cur } = await admin
    .from("tenant_notify")
    .select("line_token, smtp_pass, line_enabled, email_enabled, smtp_host, smtp_port, smtp_user, line_broadcast")
    .eq("tenant_id", session.tenantId)
    .maybeSingle();

  // รหัสที่เก็บไว้ใช้ได้กับปลายทางเดิมเท่านั้น — เปลี่ยนเซิร์ฟเวอร์/ผู้ใช้ SMTP ต้องกรอกรหัสใหม่
  // (กันเปลี่ยน host เป็นเซิร์ฟเวอร์ของผู้ไม่หวังดีแล้วกด "ทดสอบ" เพื่อดักรหัสเดิม)
  const smtpTargetChanged = !!cur?.smtp_pass && (
    (cur.smtp_host || "") !== host || (Number(cur.smtp_port) || 0) !== port || (cur.smtp_user || "") !== (input.smtp_user?.trim() || ""));
  if (smtpTargetChanged && !input.smtp_pass) return { error: await sm("เปลี่ยนเซิร์ฟเวอร์/พอร์ต/ชื่อผู้ใช้ SMTP แล้ว ต้องกรอกรหัสผ่าน SMTP ใหม่") };
  // เปิด "ส่งถึงผู้ติดตามทั้งหมด" = ส่งหาลูกค้าทุกคนของ LINE OA → ต้องยืนยันด้วยการกรอก token ใหม่
  if (input.line_broadcast && cur?.line_broadcast === false && cur?.line_token && !input.line_token)
    return { error: await sm("เปิดส่งถึงผู้ติดตามทั้งหมด ต้องกรอก LINE Channel access token อีกครั้ง") };

  // แพ็กเกจ: เปิดช่องทางใหม่ต้องมีสิทธิ์แจ้งเตือน (ที่เปิดอยู่แล้วใช้ต่อได้)
  const turningOn = (!!input.line_enabled && !cur?.line_enabled) || (!!input.email_enabled && !cur?.email_enabled);
  const gate = await gateNotify(session.tenantId, turningOn);
  if (gate) return { error: gate };

  const to = (input.email_to || [])
    .map((s) => String(s).trim())
    .filter((s) => s && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
    .slice(0, 20);

  const row = {
    tenant_id: session.tenantId,
    line_enabled: !!input.line_enabled,
    line_token: input.line_token ? input.line_token.trim() : ((cur?.line_token as string) ?? null),
    line_target: input.line_target?.trim() || null,
    line_broadcast: !!input.line_broadcast,
    email_enabled: !!input.email_enabled,
    smtp_host: host || null,
    smtp_port: smtpPortAllowed(port) ? port : null,
    smtp_user: input.smtp_user?.trim() || null,
    smtp_pass: input.smtp_pass ? input.smtp_pass : ((cur?.smtp_pass as string) ?? null),
    email_from: input.email_from?.trim() || null,
    email_to: to,
    on_created: !!input.on_created,
    on_approved: !!input.on_approved,
    on_rejected: !!input.on_rejected,
    fail_only: !!input.fail_only,
    on_case: input.on_case !== false,
    updated_at: new Date().toISOString(),
  };

  let { error } = await admin.from("tenant_notify").upsert(row, { onConflict: "tenant_id" });
  // ยังไม่ได้รัน migration 0033/0043 (ไม่มีคอลัมน์ on_case / line_broadcast) → บันทึกส่วนที่เหลือตามเดิม
  for (const col of ["line_broadcast", "on_case"] as const) {
    if (error && new RegExp(col).test(error.message)) {
      delete (row as Record<string, unknown>)[col];
      ({ error } = await admin.from("tenant_notify").upsert(row, { onConflict: "tenant_id" }));
    }
  }
  if (error) return { error: await sm(dbError(error)) };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

/** ปิดแจ้งเตือนทุกช่องทาง (ใช้ได้ทุกแพ็กเกจ — ไว้ปิดของที่ตั้งไว้ก่อนลดแพ็กเกจ) · ค่าที่ตั้งไว้ยังเก็บอยู่ */
export async function disableNotify(): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์") };
  const admin = getAdminClient();
  if (!admin) return { error: NO_ADMIN };
  const { error } = await admin.from("tenant_notify").update({ line_enabled: false, email_enabled: false, updated_at: new Date().toISOString() }).eq("tenant_id", session.tenantId);
  if (error) return { error: await sm(dbError(error)) };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

// ทดสอบส่งจริงจาก config ที่บันทึกไว้ (บันทึกก่อนแล้วค่อยกดทดสอบ)
export async function testNotify(channel: "line" | "email"): Promise<{ ok: boolean; status: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { ok: false, status: "unauthorized" };
  const locked = await gateLocked(session.tenantId, "notify");
  if (locked) return { ok: false, status: locked };
  const admin = getAdminClient();
  if (!admin) return { ok: false, status: NO_ADMIN };
  const { data } = await admin
    .from("tenant_notify")
    .select("*")
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!data) return { ok: false, status: "ยังไม่ได้บันทึกการตั้งค่า" };

  const text = "[KROK] ทดสอบการแจ้งเตือน — หากได้รับข้อความนี้ แสดงว่าตั้งค่าถูกต้อง ✅";

  if (channel === "line") {
    if (!data.line_token) return { ok: false, status: "ยังไม่ได้ใส่ LINE token" };
    return sendLine(data.line_token as string, (data.line_target as string) || null, text, (data.line_broadcast as boolean | undefined) ?? true);
  }
  // email
  if (!data.smtp_host || !data.smtp_port || !data.email_from || !(data.email_to as string[])?.length) {
    return { ok: false, status: "ตั้งค่า SMTP/ผู้รับ ไม่ครบ" };
  }
  return sendEmail(
    {
      host: data.smtp_host as string,
      port: data.smtp_port as number,
      user: (data.smtp_user as string) || "",
      pass: (data.smtp_pass as string) || "",
      from: data.email_from as string,
      to: data.email_to as string[],
    },
    "[KROK] ทดสอบการแจ้งเตือน",
    text
  );
}
