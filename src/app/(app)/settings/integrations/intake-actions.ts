"use server";
// API รับข้อมูลเข้า — ตั้งค่าต่อฟอร์ม (เฉพาะผู้ดูแล; RLS can_manage ตรวจซ้ำอีกชั้น)
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";
import { sanitizeSchema } from "@/lib/form-schema";
import { validateFieldKeys } from "@/lib/intake";
import { newIntakeKey } from "@/lib/intake-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(formId: string) {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { error: "ไม่มีสิทธิ์" } as const;
  if (!UUID.test(formId)) return { error: "ไม่พบฟอร์ม" } as const;
  const supabase = await createClient();
  const { data: f } = await supabase
    .from("forms")
    .select("id, schema")
    .eq("id", formId)
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!f) return { error: "ไม่พบฟอร์ม" } as const;
  return { session, supabase, form: f };
}

function migrationMsg(m: string) {
  return /form_intake/.test(m) && /does not exist|schema cache|not find/i.test(m) ? "ยังไม่ได้รัน migration 0034_form_intake.sql" : m;
}

export async function saveIntake(
  formId: string,
  input: { enabled: boolean; field_keys: Record<string, string>; assignee: string }
): Promise<{ ok: true } | { error: string }> {
  const g = await guard(formId);
  if ("error" in g) return { error: g.error! };
  const { session, supabase, form } = g;

  let schema;
  try { schema = sanitizeSchema(form.schema); } catch { return { error: "schema ของฟอร์มไม่ถูกต้อง" }; }
  const v = validateFieldKeys(schema, input.field_keys);
  if ("error" in v) return { error: v.error };

  // ผู้รับงาน: "t:<teamId>" | "u:<userId>" | "" (ตามขั้นแรกของฟอร์ม) — ต้องอยู่ใน workspace นี้
  let assignee: { team_id: string } | { user_id: string } | null = null;
  const a = String(input.assignee || "");
  if (a.startsWith("t:") && UUID.test(a.slice(2))) {
    const { data } = await supabase.from("teams").select("id").eq("id", a.slice(2)).eq("tenant_id", session.tenantId).maybeSingle();
    if (!data) return { error: "ไม่พบทีมนี้" };
    assignee = { team_id: a.slice(2) };
  } else if (a.startsWith("u:") && UUID.test(a.slice(2))) {
    const { data } = await supabase.from("memberships").select("user_id").eq("user_id", a.slice(2)).eq("tenant_id", session.tenantId).maybeSingle();
    if (!data) return { error: "ไม่พบสมาชิกนี้" };
    assignee = { user_id: a.slice(2) };
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
export async function rotateIntakeKey(formId: string): Promise<{ key: string; prefix: string } | { error: string }> {
  const g = await guard(formId);
  if ("error" in g) return { error: g.error! };
  const { session, supabase } = g;
  const k = newIntakeKey();
  const { error } = await supabase.from("form_intake").upsert({
    form_id: formId,
    tenant_id: session.tenantId,
    key_hash: k.hash,
    key_prefix: k.prefix,
    key_created_at: new Date().toISOString(),
    updated_by: session.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "form_id" });
  if (error) return { error: migrationMsg(error.message) };
  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId, actor_id: session.userId, action: "intake.key_rotate", target_type: "form", target_id: formId, meta: { prefix: k.prefix },
  });
  revalidatePath("/settings/integrations");
  return { key: k.key, prefix: k.prefix };
}

export async function revokeIntakeKey(formId: string): Promise<{ ok: true } | { error: string }> {
  const g = await guard(formId);
  if ("error" in g) return { error: g.error! };
  const { session, supabase } = g;
  const { error } = await supabase.from("form_intake")
    .update({ key_hash: null, key_prefix: null, key_created_at: null, updated_by: session.userId, updated_at: new Date().toISOString() })
    .eq("form_id", formId);
  if (error) return { error: migrationMsg(error.message) };
  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId, actor_id: session.userId, action: "intake.key_revoke", target_type: "form", target_id: formId, meta: {},
  });
  revalidatePath("/settings/integrations");
  return { ok: true };
}
