"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";
import { testWebhook, type WebhookEvent } from "@/lib/webhooks";
import { sendLine, sendEmail } from "@/lib/notify";

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
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์" };
  if (!validUrl(url.trim())) return { error: "URL ไม่ถูกต้อง (ต้องขึ้นต้น http:// หรือ https://)" };

  const supabase = await createClient();

  // ตรวจว่า formId (ถ้ามี) เป็นฟอร์มของ tenant นี้จริง
  let form_id: string | null = null;
  if (formId) {
    const { data: f } = await supabase
      .from("forms").select("id").eq("id", formId).eq("tenant_id", session.tenantId).maybeSingle();
    if (!f) return { error: "ไม่พบฟอร์มที่เลือก" };
    form_id = formId;
  }
  const fieldIds = Array.isArray(fields)
    ? Array.from(new Set(fields.filter((x): x is string => typeof x === "string"))).slice(0, 200)
    : [];

  const { error } = await supabase.from("webhooks").insert({
    tenant_id: session.tenantId,
    name: name.trim().slice(0, 80) || "Webhook",
    url: url.trim(),
    events: cleanEvents(events),
    secret: secret.trim() ? secret.trim().slice(0, 200) : null,
    form_id,
    fields: fieldIds,
    created_by: session.userId,
  });
  if (error) return { error: error.message };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function toggleWebhook(id: string, active: boolean): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { error: "ไม่มีสิทธิ์" };
  const supabase = await createClient();
  const { error } = await supabase.from("webhooks").update({ active }).eq("id", id).eq("tenant_id", session.tenantId);
  if (error) return { error: error.message };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function deleteWebhook(id: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { error: "ไม่มีสิทธิ์" };
  const supabase = await createClient();
  const { error } = await supabase.from("webhooks").delete().eq("id", id).eq("tenant_id", session.tenantId);
  if (error) return { error: error.message };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function testWebhookById(id: string): Promise<{ ok: boolean; status: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { ok: false, status: "unauthorized" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("webhooks")
    .select("url, secret")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!data) return { ok: false, status: "not found" };
  const res = await testWebhook(data.url as string, (data.secret as string) ?? null);
  await supabase
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
}

export async function saveNotify(input: NotifyInput): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { error: "unauthorized" };
  const supabase = await createClient();

  // อ่านของเดิมเพื่อคงค่า secret ถ้าผู้ใช้ไม่ได้กรอกใหม่
  const { data: cur } = await supabase
    .from("tenant_notify")
    .select("line_token, smtp_pass")
    .eq("tenant_id", session.tenantId)
    .maybeSingle();

  const to = (input.email_to || [])
    .map((s) => String(s).trim())
    .filter((s) => s && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
    .slice(0, 20);

  const row = {
    tenant_id: session.tenantId,
    line_enabled: !!input.line_enabled,
    line_token: input.line_token ? input.line_token.trim() : ((cur?.line_token as string) ?? null),
    line_target: input.line_target?.trim() || null,
    email_enabled: !!input.email_enabled,
    smtp_host: input.smtp_host?.trim() || null,
    smtp_port: Number.isFinite(input.smtp_port) && input.smtp_port > 0 ? Math.round(input.smtp_port) : null,
    smtp_user: input.smtp_user?.trim() || null,
    smtp_pass: input.smtp_pass ? input.smtp_pass : ((cur?.smtp_pass as string) ?? null),
    email_from: input.email_from?.trim() || null,
    email_to: to,
    on_created: !!input.on_created,
    on_approved: !!input.on_approved,
    on_rejected: !!input.on_rejected,
    fail_only: !!input.fail_only,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("tenant_notify").upsert(row, { onConflict: "tenant_id" });
  if (error) return { error: error.message };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

// ทดสอบส่งจริงจาก config ที่บันทึกไว้ (บันทึกก่อนแล้วค่อยกดทดสอบ)
export async function testNotify(channel: "line" | "email"): Promise<{ ok: boolean; status: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { ok: false, status: "unauthorized" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_notify")
    .select("*")
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!data) return { ok: false, status: "ยังไม่ได้บันทึกการตั้งค่า" };

  const text = "[KROK] ทดสอบการแจ้งเตือน — หากได้รับข้อความนี้ แสดงว่าตั้งค่าถูกต้อง ✅";

  if (channel === "line") {
    if (!data.line_token) return { ok: false, status: "ยังไม่ได้ใส่ LINE token" };
    return sendLine(data.line_token as string, (data.line_target as string) || null, text);
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
