"use server";
import { revalidatePath } from "next/cache";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { writeAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";
import { sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { isWorkflowSchema } from "@/lib/case-flow";
import { gateWorkflow } from "@/lib/quota";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const okVer = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) < 1e6;

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;
async function guard(): Promise<{ error: string } | { session: Session }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์") };
  return { session };
}

/** schema ของเวอร์ชันหนึ่ง (ดูตัวอย่าง) */
export async function getFormVersion(formId: string, version: number): Promise<{ schema: FormSchema; title: string } | { error: string }> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  if (!UUID_RE.test(formId) || !okVer(version)) return { error: await sm("ไม่พบเวอร์ชันนี้") };
  const supabase = await createClient();
  const { data } = await supabase.from("form_versions").select("schema, title").eq("form_id", formId).eq("version", version).eq("tenant_id", g.session.tenantId).maybeSingle();
  if (!data) return { error: await sm("ไม่พบเวอร์ชันนี้") };
  try {
    return { schema: sanitizeSchema(data.schema), title: (data.title as string) || "" };
  } catch {
    return { error: await sm("ฟอร์มไม่ถูกต้อง") };
  }
}

export async function setVersionNote(formId: string, version: number, note: string): Promise<{ ok: true } | { error: string }> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  if (!UUID_RE.test(formId) || !okVer(version)) return { error: await sm("ไม่พบเวอร์ชันนี้") };
  const supabase = await createClient();
  const { error } = await supabase.from("form_versions").update({ note: String(note || "").trim().slice(0, 300) }).eq("form_id", formId).eq("version", version).eq("tenant_id", g.session.tenantId);
  if (error) return { error: await sm(dbError(error)) };
  revalidatePath(`/studio/history/${formId}`);
  return { ok: true };
}

/**
 * กู้คืน = บันทึก schema ของเวอร์ชันเก่าเป็นเวอร์ชันใหม่ (ประวัติเดิมไม่หาย)
 * ใบที่ส่งแล้วไม่เปลี่ยน · แบบร่างที่ค้างอยู่จะเห็นคำเตือนว่าฟอร์มถูกแก้
 */
export async function restoreFormVersion(formId: string, version: number): Promise<{ ok: true; version: number } | { error: string }> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const { session } = g;
  if (!UUID_RE.test(formId) || !okVer(version)) return { error: await sm("ไม่พบเวอร์ชันนี้") };
  const supabase = await createClient();
  const [{ data: v }, { data: cur }] = await Promise.all([
    supabase.from("form_versions").select("schema").eq("form_id", formId).eq("version", version).eq("tenant_id", session.tenantId).maybeSingle(),
    supabase.from("forms").select("schema, version, title, icon").eq("id", formId).eq("tenant_id", session.tenantId).is("deleted_at", null).maybeSingle(),
  ]);
  if (!v) return { error: await sm("ไม่พบเวอร์ชันนี้") };
  if (!cur) return { error: await sm("ไม่พบฟอร์ม") };
  if ((cur.version as number) === version) return { error: await sm("เวอร์ชันนี้เป็นเวอร์ชันปัจจุบันอยู่แล้ว") };

  let schema: FormSchema;
  try { schema = sanitizeSchema(v.schema); } catch { return { error: await sm("ฟอร์มไม่ถูกต้อง") }; }
  let wasWf = false;
  try { wasWf = isWorkflowSchema(sanitizeSchema(cur.schema)); } catch { /* schema เดิมเสีย */ }
  const gate = await gateWorkflow(session.tenantId, isWorkflowSchema(schema), wasWf);
  if (gate) return { error: gate };

  const { data: up, error } = await supabase
    .from("forms")
    .update({ title: schema.title, icon: schema.icon, description: schema.description, schema, updated_at: new Date().toISOString() })
    .eq("id", formId)
    .eq("tenant_id", session.tenantId)
    .select("version")
    .single();
  if (error) return { error: await sm(dbError(error)) };
  const newVer = up.version as number;
  // หมายเหตุอัตโนมัติ (คนกู้แก้ต่อได้) · restored_from เขียนได้เฉพาะ service role → เก็บในหมายเหตุพอ
  await supabase.from("form_versions").update({ note: `กู้คืนจาก v${version}` }).eq("form_id", formId).eq("version", newVer);

  if (cur.title !== schema.title || cur.icon !== schema.icon) {
    await supabase.from("submissions").update({ form_title: schema.title, form_icon: schema.icon }).eq("form_id", formId).eq("tenant_id", session.tenantId);
  }
  await writeAudit({ tenant_id: session.tenantId, actor_id: session.userId, action: "form.restore", target_type: "form", target_id: formId, meta: { from: version, to: newVer } });
  revalidatePath(`/studio/history/${formId}`);
  revalidatePath("/studio");
  revalidatePath("/forms");
  return { ok: true, version: newVer };
}
