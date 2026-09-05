"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
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

// แจ้งเตือน "ฟอร์มใหม่" ให้สมาชิกที่มีสิทธิ์เห็นฟอร์ม (ใช้ service role เพราะ notifications ไม่มี insert policy)
async function notifyNewForm(
  tenantId: string,
  formId: string,
  title: string,
  icon: string,
  vis: Visibility,
  actorId: string
) {
  const admin = getAdminClient();
  if (!admin) return;
  try {
    let userIds: string[] = [];
    if (vis.mode === "teams") {
      if (vis.teamIds.length) {
        const { data } = await admin.from("team_members").select("user_id").eq("tenant_id", tenantId).in("team_id", vis.teamIds);
        userIds = (data || []).map((r) => r.user_id as string);
      }
    } else if (vis.mode === "users") {
      userIds = vis.userIds;
    } else {
      // public / all → สมาชิกทั้ง workspace
      const { data } = await admin.from("memberships").select("user_id").eq("tenant_id", tenantId);
      userIds = (data || []).map((r) => r.user_id as string);
    }
    userIds = Array.from(new Set(userIds)).filter((u) => u && u !== actorId);
    if (!userIds.length) return;
    const rows = userIds.map((uid) => ({
      tenant_id: tenantId,
      user_id: uid,
      type: "new_form",
      title: `${icon} ฟอร์มใหม่: ${title}`,
      body: "มีฟอร์มใหม่ให้กรอก — แตะเพื่อเปิด",
      link: `/forms?f=${formId}`,
    }));
    await admin.from("notifications").insert(rows);
  } catch {
    /* best-effort */
  }
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
  await notifyNewForm(session.tenantId, data.id as string, schema.title, schema.icon, vis, session.userId);
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

  // เผยแพร่ (จากร่าง/กู้คืน) → แจ้งเตือนสมาชิกที่มีสิทธิ์เห็นฟอร์ม
  if (status === "published") {
    const { data: f } = await supabase
      .from("forms")
      .select("title, icon, visibility, visible_teams, visible_users")
      .eq("id", id)
      .eq("tenant_id", session.tenantId)
      .maybeSingle();
    if (f) {
      await notifyNewForm(
        session.tenantId, id, (f.title as string) || "ฟอร์ม", (f.icon as string) || "📋",
        { mode: (f.visibility as Visibility["mode"]) || "all", teamIds: (f.visible_teams as string[]) || [], userIds: (f.visible_users as string[]) || [] },
        session.userId
      );
    }
  }

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
