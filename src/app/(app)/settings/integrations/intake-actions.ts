"use server";
import { sm } from "@/lib/server-msg";
// API รับข้อมูลเข้า — ตั้งค่าต่อฟอร์ม (เฉพาะผู้ดูแล; RLS can_manage ตรวจซ้ำอีกชั้น)
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";
import { sanitizeSchema } from "@/lib/form-schema";
import { validateFieldKeys } from "@/lib/intake";
import { newIntakeKey } from "@/lib/intake-server";
import { gateIntakeEnable, gateLocked } from "@/lib/quota";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(formId: string) {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์") } as const;
  if (!UUID.test(formId)) return { error: await sm("ไม่พบฟอร์ม") } as const;
  const supabase = await createClient();
  const { data: f } = await supabase
    .from("forms")
    .select("id, schema")
    .eq("id", formId)
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!f) return { error: await sm("ไม่พบฟอร์ม") } as const;
  return { session, supabase, form: f };
}

function migrationMsg(m: string) {
  if (/key_expires_at/.test(m)) return "ฟีเจอร์นี้ยังไม่พร้อมใช้งานในระบบ — ติดต่อผู้ดูแลระบบ KROK";
  return /form_intake/.test(m) && /does not exist|schema cache|not find/i.test(m) ? "ฟีเจอร์นี้ยังไม่พร้อมใช้งานในระบบ — ติดต่อผู้ดูแลระบบ KROK" : m;
}

/** อายุ key ที่เลือกได้ (วัน) · null = ไม่หมดอายุ */
const EXPIRY_DAYS = [30, 90, 180, 365];
function expiryFrom(days: number | null): string | null | undefined {
  if (days === null) return null;
  if (!EXPIRY_DAYS.includes(days)) return undefined; // ค่าไม่ถูกต้อง
  return new Date(Date.now() + days * 86400_000).toISOString();
}

export async function saveIntake(
  formId: string,
  input: { enabled: boolean; field_keys: Record<string, string>; assignee: string }
): Promise<{ ok: true } | { error: string }> {
  const g = await guard(formId);
  if ("error" in g) return { error: g.error! };
  const { session, supabase, form } = g;

  let schema;
  try { schema = sanitizeSchema(form.schema); } catch { return { error: await sm("schema ของฟอร์มไม่ถูกต้อง") }; }
  const v = validateFieldKeys(schema, input.field_keys);
  if ("error" in v) return { error: v.error };

  // ผู้รับงาน: "t:<teamId>" | "u:<userId>" | "" (ตามขั้นแรกของฟอร์ม) — ต้องอยู่ใน workspace นี้
  let assignee: { team_id: string } | { user_id: string } | null = null;
  const a = String(input.assignee || "");
  if (a.startsWith("t:") && UUID.test(a.slice(2))) {
    const { data } = await supabase.from("teams").select("id").eq("id", a.slice(2)).eq("tenant_id", session.tenantId).maybeSingle();
    if (!data) return { error: await sm("ไม่พบทีมนี้") };
    assignee = { team_id: a.slice(2) };
  } else if (a.startsWith("u:") && UUID.test(a.slice(2))) {
    const { data } = await supabase.from("memberships").select("user_id").eq("user_id", a.slice(2)).eq("tenant_id", session.tenantId).maybeSingle();
    if (!data) return { error: await sm("ไม่พบสมาชิกนี้") };
    assignee = { user_id: a.slice(2) };
  }

  if (input.enabled) {
    const locked = await gateLocked(session.tenantId, "intake"); // แพ็กเกจไม่รวม: แก้ค่าของที่เปิดค้างไว้ไม่ได้ ปิดได้อย่างเดียว
    if (locked) return { error: locked };
    const { data: prev } = await supabase.from("form_intake").select("enabled").eq("form_id", formId).maybeSingle();
    if (!prev?.enabled) {
      const gate = await gateIntakeEnable(session.tenantId, formId);
      if (gate) return { error: gate };
    }
  }

  const { error } = await supabase.from("form_intake").upsert({
    form_id: formId,
    tenant_id: session.tenantId,
    enabled: !!input.enabled,
    field_keys: v.keys,
    assignee,
    updated_by: session.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "form_id" });
  if (error) return { error: migrationMsg(error.message) };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

/** สร้าง API key ใหม่ (คีย์เดิมใช้ไม่ได้ทันที) — คืนคีย์เต็มครั้งเดียว */
export async function rotateIntakeKey(formId: string, days: number | null = 90): Promise<{ key: string; prefix: string } | { error: string }> {
  const g = await guard(formId);
  if ("error" in g) return { error: g.error! };
  const { session, supabase } = g;
  const locked = await gateLocked(session.tenantId, "intake");
  if (locked) return { error: locked };
  const expires = expiryFrom(days);
  if (expires === undefined) return { error: await sm("อายุ key ไม่ถูกต้อง") };
  const k = newIntakeKey();
  const { error } = await supabase.from("form_intake").upsert({
    form_id: formId,
    tenant_id: session.tenantId,
    key_hash: k.hash,
    key_prefix: k.prefix,
    key_created_at: new Date().toISOString(),
    key_expires_at: expires,
    updated_by: session.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "form_id" });
  if (error) return { error: migrationMsg(error.message) };
  await writeAudit({
    tenant_id: session.tenantId, actor_id: session.userId, action: "intake.key_rotate", target_type: "form", target_id: formId, meta: { prefix: k.prefix, expires_days: days },
  });
  revalidatePath("/settings/integrations");
  return { key: k.key, prefix: k.prefix };
}

/** ปิด API รับข้อมูลของฟอร์มนี้ (ใช้ได้ทุกแพ็กเกจ) — ค่าที่ตั้งไว้ยังเก็บอยู่ */
export async function disableIntake(formId: string): Promise<{ ok: true } | { error: string }> {
  const g = await guard(formId);
  if ("error" in g) return { error: g.error! };
  const { session, supabase } = g;
  const { error } = await supabase.from("form_intake").update({ enabled: false, updated_by: session.userId, updated_at: new Date().toISOString() }).eq("form_id", formId);
  if (error) return { error: migrationMsg(error.message) };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function revokeIntakeKey(formId: string): Promise<{ ok: true } | { error: string }> {
  const g = await guard(formId);
  if ("error" in g) return { error: g.error! };
  const { session, supabase } = g;
  const { error } = await supabase.from("form_intake")
    .update({ key_hash: null, key_prefix: null, key_created_at: null, key_expires_at: null, updated_by: session.userId, updated_at: new Date().toISOString() })
    .eq("form_id", formId);
  if (error) return { error: migrationMsg(error.message) };
  await writeAudit({
    tenant_id: session.tenantId, actor_id: session.userId, action: "intake.key_revoke", target_type: "form", target_id: formId, meta: {},
  });
  revalidatePath("/settings/integrations");
  return { ok: true };
}

/** ต่ออายุ/เปลี่ยนวันหมดอายุของ key ปัจจุบัน (นับจากวันนี้) — key เดิมใช้ต่อได้ ระบบภายนอกไม่ต้องเปลี่ยน */
export async function setIntakeKeyExpiry(formId: string, days: number | null): Promise<{ ok: true } | { error: string }> {
  const g = await guard(formId);
  if ("error" in g) return { error: g.error! };
  const { session, supabase } = g;
  const locked = await gateLocked(session.tenantId, "intake");
  if (locked) return { error: locked };
  const expires = expiryFrom(days);
  if (expires === undefined) return { error: await sm("อายุ key ไม่ถูกต้อง") };
  const { data, error } = await supabase.from("form_intake")
    .update({ key_expires_at: expires, updated_by: session.userId, updated_at: new Date().toISOString() })
    .eq("form_id", formId).not("key_hash", "is", null).select("form_id");
  if (error) return { error: migrationMsg(error.message) };
  if (!data?.length) return { error: await sm("ยังไม่มี key") };
  await writeAudit({
    tenant_id: session.tenantId, actor_id: session.userId, action: "intake.key_expiry", target_type: "form", target_id: formId, meta: { expires_days: days },
  });
  revalidatePath("/settings/integrations");
  return { ok: true };
}
