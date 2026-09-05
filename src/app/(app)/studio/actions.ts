"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";
import { sanitizeSchema, countFields, type FormSchema } from "@/lib/form-schema";
import { sanitizeChain } from "@/lib/approval";
import { canAddForm } from "@/lib/quota";
import { fmtLimit } from "@/lib/plans";

async function audit(
  tenantId: string,
  actorId: string,
  action: string,
  targetId: string | null,
  meta: Record<string, unknown> = {}
) {
  const supabase = await createClient();
  await supabase.from("audit_log").insert({
    tenant_id: tenantId,
    actor_id: actorId,
    action,
    target_type: "form",
    target_id: targetId,
    meta,
  });
}

export interface Visibility {
  mode: "public" | "all" | "teams" | "users";
  teamIds: string[];
  userIds: string[];
}

function sanitizeVisibility(v: unknown): Visibility {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const mode =
    o.mode === "public" || o.mode === "teams" || o.mode === "users" ? o.mode : "all";
  const asIds = (x: unknown) =>
    Array.isArray(x) ? Array.from(new Set(x.filter((s): s is string => typeof s === "string"))) : [];
  return {
    mode,
    teamIds: mode === "teams" ? asIds(o.teamIds) : [],
    userIds: mode === "users" ? asIds(o.userIds) : [],
  };
}

// เปลี่ยนสิทธิ์การแชร์ของฟอร์มจากหน้า "ฟอร์มทั้งหมด" (ไม่ต้องเปิด editor)
export async function setFormVisibility(
  formId: string,
  rawVisibility: unknown
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์แก้สิทธิ์การแชร์" };

  const vis = sanitizeVisibility(rawVisibility);
  const supabase = await createClient();
  const { error } = await supabase
    .from("forms")
    .update({ visibility: vis.mode, visible_teams: vis.teamIds, visible_users: vis.userIds })
    .eq("id", formId)
    .eq("tenant_id", session.tenantId);
  if (error) return { error: error.message };

  await audit(session.tenantId, session.userId, "form.visibility", formId, { mode: vis.mode });
  revalidatePath("/studio");
  revalidatePath("/forms");
  return { ok: true };
}

export async function saveForm(
  rawSchema: unknown,
  requiresApproval = false,
  rawChain: unknown = [],
  rawVisibility: unknown = { mode: "all", teamIds: [], userIds: [] }
): Promise<{ id: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์สร้างฟอร์ม" };

  let schema: FormSchema;
  try {
    schema = sanitizeSchema(rawSchema);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "schema ไม่ถูกต้อง" };
  }
  const chain = requiresApproval ? sanitizeChain(rawChain) : [];
  const vis = sanitizeVisibility(rawVisibility);

  const quota = await canAddForm(session.tenantId);
  if (!quota.ok)
    return { error: `แผนปัจจุบันสร้างฟอร์มได้สูงสุด ${fmtLimit(quota.max)} ฟอร์ม (ใช้ไป ${quota.used}) — อัปเกรดแผนที่หน้า “แผน/โควตา” เพื่อเพิ่มโควตา` };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .insert({
      tenant_id: session.tenantId,
      title: schema.title,
      icon: schema.icon,
      description: schema.description,
      schema,
      status: "published",
      requires_approval: requiresApproval,
      approval_chain: chain,
      visibility: vis.mode,
      visible_teams: vis.teamIds,
      visible_users: vis.userIds,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  await audit(session.tenantId, session.userId, "form.publish", data.id, {
    title: schema.title,
    fields: countFields(schema),
    requires_approval: requiresApproval,
    approval_steps: chain.length,
    visibility: vis.mode,
  });
  revalidatePath("/forms");
  revalidatePath("/studio");
  return { id: data.id as string };
}

export async function updateForm(
  id: string,
  rawSchema: unknown,
  requiresApproval = false,
  rawChain: unknown = [],
  rawVisibility: unknown = { mode: "all", teamIds: [], userIds: [] }
): Promise<{ id: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์แก้ไขฟอร์ม" };

  let schema: FormSchema;
  try {
    schema = sanitizeSchema(rawSchema);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "schema ไม่ถูกต้อง" };
  }
  const chain = requiresApproval ? sanitizeChain(rawChain) : [];
  const vis = sanitizeVisibility(rawVisibility);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .update({
      title: schema.title,
      icon: schema.icon,
      description: schema.description,
      schema,
      requires_approval: requiresApproval,
      approval_chain: chain,
      visibility: vis.mode,
      visible_teams: vis.teamIds,
      visible_users: vis.userIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .select("id")
    .single();

  if (error) return { error: error.message };

  // ซิงก์ชื่อ/ไอคอนไปยัง submissions เดิม เพื่อให้ทุกหน้า (dashboard/ประวัติ/อนุมัติ) แสดงชื่อใหม่ตรงกัน
  // เป็นการ update จริง → ส่ง realtime UPDATE ให้ dashboard อัปเดตสด
  await supabase
    .from("submissions")
    .update({ form_title: schema.title, form_icon: schema.icon })
    .eq("form_id", id)
    .eq("tenant_id", session.tenantId);

  await audit(session.tenantId, session.userId, "form.update", id, {
    title: schema.title,
    fields: countFields(schema),
    visibility: vis.mode,
  });
  revalidatePath("/forms");
  revalidatePath("/studio");
  revalidatePath("/dashboard");
  revalidatePath("/approvals");
  revalidatePath("/", "layout");
  return { id: data.id as string };
}

export async function saveDraft(
  rawSchema: unknown,
  requiresApproval = false,
  rawChain: unknown = [],
  rawVisibility: unknown = { mode: "all", teamIds: [], userIds: [] }
): Promise<{ id: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์สร้างฟอร์ม" };

  let schema: FormSchema;
  try {
    schema = sanitizeSchema(rawSchema);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "schema ไม่ถูกต้อง" };
  }
  const chain = requiresApproval ? sanitizeChain(rawChain) : [];
  const vis = sanitizeVisibility(rawVisibility);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .insert({
      tenant_id: session.tenantId,
      title: schema.title,
      icon: schema.icon,
      description: schema.description,
      schema,
      status: "draft",
      requires_approval: requiresApproval,
      approval_chain: chain,
      visibility: vis.mode,
      visible_teams: vis.teamIds,
      visible_users: vis.userIds,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await audit(session.tenantId, session.userId, "form.draft", data.id, { title: schema.title });
  revalidatePath("/studio");
  return { id: data.id as string };
}

export async function setFormStatus(
  id: string,
  status: "draft" | "published" | "archived"
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์" };
  if (!["draft", "published", "archived"].includes(status)) return { error: "สถานะไม่ถูกต้อง" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("forms")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) return { error: error.message };
  await audit(session.tenantId, session.userId, "form.status", id, { status });
  revalidatePath("/studio");
  revalidatePath("/forms");
  return { ok: true };
}

export async function deleteForm(id: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("forms")
    .update({ deleted_at: new Date().toISOString(), status: "archived" })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) return { error: error.message };
  await audit(session.tenantId, session.userId, "form.delete", id);
  revalidatePath("/forms");
  revalidatePath("/studio");
  return { ok: true };
}
