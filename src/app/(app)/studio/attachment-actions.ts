"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage, type KrokSession } from "@/lib/session";
import {
  MAX_ATTACH_BYTES,
  MAX_ATTACH_PER_SLOT,
  isAllowedMime,
  rowToAttachment,
  type Attachment,
} from "@/lib/attachments";

const SELECT = "id, field_id, kind, name, mime, size_bytes, url, sort";

/** รายการเอกสารแนบทั้งหมดของฟอร์ม (ทั้งระดับฟอร์มและระดับฟิลด์) */
export async function listAttachments(formId: string): Promise<Attachment[]> {
  const session = await getSession();
  if (!session) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_attachments")
    .select(SELECT)
    .eq("form_id", formId)
    .eq("tenant_id", session.tenantId)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  return (data || []).map((r) => rowToAttachment(r as Record<string, unknown>));
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type Guard = { ok: false; error: string } | { ok: true; session: KrokSession; supabase: ServerClient };

async function guard(formId: string): Promise<Guard> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthorized" };
  if (!canManage(session.role)) return { ok: false, error: "ไม่มีสิทธิ์แนบเอกสาร" };

  const supabase = await createClient();
  const { data: form } = await supabase
    .from("forms")
    .select("id")
    .eq("id", formId)
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!form) return { ok: false, error: "ไม่พบฟอร์มนี้" };
  return { ok: true, session, supabase };
}

async function slotCount(
  supabase: ServerClient,
  formId: string,
  fieldId: string | null
): Promise<number> {
  const q = supabase.from("form_attachments").select("id", { count: "exact", head: true }).eq("form_id", formId);
  const { count } = await (fieldId ? q.eq("field_id", fieldId) : q.is("field_id", null));
  return count ?? 0;
}

/**
 * บันทึก metadata ของไฟล์ที่ browser อัปขึ้น bucket 'attachments' แล้ว
 * storagePath ต้องอยู่ใต้ <tenant_id>/<form_id>/ เท่านั้น (กันเขียนข้ามองค์กร)
 */
export async function addFileAttachment(
  formId: string,
  fieldId: string | null,
  input: { name: string; storagePath: string; mime: string; size: number }
): Promise<{ attachment: Attachment } | { error: string }> {
  const g = await guard(formId);
  if (!g.ok) return { error: g.error };
  const { session, supabase } = g;

  const name = String(input.name || "").slice(0, 160).trim() || "เอกสาร";
  const mime = String(input.mime || "").slice(0, 120);
  const size = Number(input.size) || 0;

  if (!isAllowedMime(mime)) return { error: "รองรับเฉพาะ PDF, รูปภาพ, วิดีโอ MP4 และไฟล์ข้อความ" };
  if (size > MAX_ATTACH_BYTES) return { error: "ไฟล์ใหญ่เกินกำหนด" };
  if (!input.storagePath.startsWith(`${session.tenantId}/${formId}/`))
    return { error: "path ไม่ถูกต้อง" };
  if ((await slotCount(supabase, formId, fieldId)) >= MAX_ATTACH_PER_SLOT)
    return { error: `แนบได้สูงสุด ${MAX_ATTACH_PER_SLOT} รายการต่อจุด` };

  const { data, error } = await supabase
    .from("form_attachments")
    .insert({
      tenant_id: session.tenantId,
      form_id: formId,
      field_id: fieldId,
      kind: "file",
      name,
      storage_path: input.storagePath,
      mime,
      size_bytes: size,
      created_by: session.userId,
    })
    .select(SELECT)
    .single();

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId,
    actor_id: session.userId,
    action: "attachment.add",
    target_type: "form",
    target_id: formId,
    meta: { name, field_id: fieldId, kind: "file", size },
  });

  revalidatePath("/studio");
  return { attachment: rowToAttachment(data as Record<string, unknown>) };
}

/** แนบเป็นลิงก์ภายนอก (SharePoint / Drive / เว็บคู่มือ) */
export async function addLinkAttachment(
  formId: string,
  fieldId: string | null,
  input: { name: string; url: string }
): Promise<{ attachment: Attachment } | { error: string }> {
  const g = await guard(formId);
  if (!g.ok) return { error: g.error };
  const { session, supabase } = g;

  const url = String(input.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return { error: "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://" };
  const name = String(input.name || "").slice(0, 160).trim() || url.slice(0, 60);
  if ((await slotCount(supabase, formId, fieldId)) >= MAX_ATTACH_PER_SLOT)
    return { error: `แนบได้สูงสุด ${MAX_ATTACH_PER_SLOT} รายการต่อจุด` };

  const { data, error } = await supabase
    .from("form_attachments")
    .insert({
      tenant_id: session.tenantId,
      form_id: formId,
      field_id: fieldId,
      kind: "link",
      name,
      url: url.slice(0, 2000),
      mime: "text/uri-list",
      created_by: session.userId,
    })
    .select(SELECT)
    .single();

  if (error) return { error: error.message };
  revalidatePath("/studio");
  return { attachment: rowToAttachment(data as Record<string, unknown>) };
}

export async function renameAttachment(id: string, name: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("form_attachments")
    .update({ name: String(name || "").slice(0, 160).trim() || "เอกสาร" })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) return { error: error.message };
  revalidatePath("/studio");
  return { ok: true };
}

export async function removeAttachment(id: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์" };

  const supabase = await createClient();
  const { data: att } = await supabase
    .from("form_attachments")
    .select("id, storage_path, kind, form_id, name")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!att) return { error: "ไม่พบเอกสาร" };

  const { error } = await supabase.from("form_attachments").delete().eq("id", id).eq("tenant_id", session.tenantId);
  if (error) return { error: error.message };

  // ลบไฟล์จริงตามหลัง (ถ้าลบไม่ได้ก็ไม่ล้มทั้ง action — แถวหายแล้ว)
  if (att.kind === "file" && att.storage_path) {
    try { await supabase.storage.from("attachments").remove([att.storage_path as string]); } catch { /* ignore */ }
  }

  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId,
    actor_id: session.userId,
    action: "attachment.remove",
    target_type: "form",
    target_id: att.form_id as string,
    meta: { name: att.name },
  });

  revalidatePath("/studio");
  return { ok: true };
}
