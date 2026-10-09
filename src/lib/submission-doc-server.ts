import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import type { FormSchema } from "@/lib/form-schema";

const isSchema = (x: unknown): x is FormSchema => !!x && typeof x === "object" && Array.isArray((x as FormSchema).steps);

/**
 * schema ที่ใช้วาดเอกสาร A4 ของใบที่ส่งแล้ว — เวอร์ชันเดียวกับตอนกรอก (ฟอร์มที่แก้ภายหลังไม่ทำให้เอกสารเก่าเปลี่ยนหน้าตา)
 * ลำดับ: form_versions ของเวอร์ชันที่กรอก → schema ที่งาน (ขั้นตอน) เก็บไว้ → schema ปัจจุบันของฟอร์ม
 *
 * form_versions อ่านได้เฉพาะผู้จัดการ (RLS) แต่ผู้กรอกก็ต้องเห็นเอกสารของตัวเองตามแบบที่กรอก
 * → อ่านด้วย service role จำกัดด้วย tenant + form ของใบนี้ (ผู้ดูผ่านสิทธิ์ดูใบนี้จาก RLS ของ submissions มาแล้ว)
 */
export async function getDocSchema(
  supabase: SupabaseClient,
  sub: { tenant_id: string; form_id: string | null; form_version: number | null; case_id: string | null },
): Promise<FormSchema | null> {
  const admin = getAdminClient();
  const db = admin ?? supabase;
  if (sub.form_id && sub.form_version) {
    const { data } = await db.from("form_versions").select("schema").eq("tenant_id", sub.tenant_id).eq("form_id", sub.form_id).eq("version", sub.form_version).maybeSingle();
    if (isSchema(data?.schema)) return data.schema;
  }
  if (sub.case_id) {
    const { data } = await db.from("form_cases").select("schema").eq("tenant_id", sub.tenant_id).eq("id", sub.case_id).maybeSingle();
    if (isSchema(data?.schema)) return data.schema;
  }
  if (sub.form_id) {
    const { data } = await db.from("forms").select("schema").eq("tenant_id", sub.tenant_id).eq("id", sub.form_id).maybeSingle();
    if (isSchema(data?.schema)) return data.schema;
  }
  return null;
}
