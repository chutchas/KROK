"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getSession, canManage } from "@/lib/session";
import { sanitizeSchema, countFields, type FormSchema } from "@/lib/form-schema";
import { sanitizeChain } from "@/lib/approval";
import { canAddForm, gateApprovalSteps, gateWorkflow } from "@/lib/quota";
import { isWorkflowSchema } from "@/lib/case-flow";
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
      // เฉพาะผู้ใช้ที่เป็นสมาชิก workspace นี้จริง (กันยิงแจ้งเตือนไปหาคนนอกด้วย user id ที่ส่งมาเอง)
      if (vis.userIds.length) {
        const { data } = await admin.from("memberships").select("user_id").eq("tenant_id", tenantId).in("user_id", vis.userIds.slice(0, 500));
        userIds = (data || []).map((r) => r.user_id as string);
      }
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeVisibility(v: unknown): Visibility {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const mode =
    o.mode === "public" || o.mode === "teams" || o.mode === "users" ? o.mode : "all";
  const asIds = (x: unknown) =>
    Array.isArray(x) ? Array.from(new Set(x.filter((s): s is string => typeof s === "string" && UUID_RE.test(s)))).slice(0, 500) : [];
  return {
    mode,
    teamIds: mode === "teams" ? asIds(o.teamIds) : [],
    userIds: mode === "users" ? asIds(o.userIds) : [],
  };
}

// ฟอร์มสาธารณะเปิดจาก QR โดยคนนอกองค์กร — ล็อคเครื่องกับฟอร์มแบบนั้นไม่มีความหมาย จึงบังคับปิดเสมอ
function deviceLock(requireDevice: boolean, vis: Visibility): boolean {
  return vis.mode === "public" ? false : !!requireDevice;
}

// ขอบเขตเครื่องมีความหมายเฉพาะตอนล็อคเครื่องเท่านั้น
function deviceScopeOf(requireDevice: boolean, vis: Visibility, scope: "any" | "selected"): "any" | "selected" {
  return deviceLock(requireDevice, vis) && scope === "selected" ? "selected" : "any";
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
  rawVisibility: unknown = { mode: "all", teamIds: [], userIds: [] },
  requireDevice = false,
  deviceScope: "any" | "selected" = "any"
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

  const gate = (await gateApprovalSteps(session.tenantId, chain.length)) ?? (await gateWorkflow(session.tenantId, isWorkflowSchema(schema)));
  if (gate) return { error: gate };

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
      require_approved_device: deviceLock(requireDevice, vis),
      device_scope: deviceScopeOf(requireDevice, vis, deviceScope),
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

// สร้างฟอร์มใหม่จากเทมเพลตสำเร็จรูป (built-in) — ใช้เส้นทางเดียวกับ saveForm
// (ตรวจโควตา + published + แจ้งเตือน) แล้วให้ผู้ใช้ไปปรับแต่งต่อที่ "สร้างฟอร์ม" ได้
export async function updateForm(
  id: string,
  rawSchema: unknown,
  requiresApproval = false,
  rawChain: unknown = [],
  rawVisibility: unknown = { mode: "all", teamIds: [], userIds: [] },
  requireDevice = false,
  deviceScope: "any" | "selected" = "any"
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
  // ชื่อ/ไอคอนเดิม — ใช้ตัดสินว่าต้องซิงก์ไป submissions เก่าไหม
  const { data: before } = await supabase.from("forms").select("title, icon, approval_chain, schema").eq("id", id).eq("tenant_id", session.tenantId).maybeSingle();
  // แพ็กเกจ: เพิ่มขั้นอนุมัติเกินลิมิต / เปิดกรอกหลายคนใหม่ ไม่ได้ (ของเดิมที่มีอยู่แล้วคงไว้ได้)
  let wasWf = false;
  try { wasWf = !!before?.schema && isWorkflowSchema(sanitizeSchema(before.schema)); } catch { /* schema เดิมเสีย */ }
  const prevSteps = Array.isArray(before?.approval_chain) ? (before.approval_chain as unknown[]).length : 0;
  const gate = (await gateApprovalSteps(session.tenantId, chain.length, prevSteps)) ?? (await gateWorkflow(session.tenantId, isWorkflowSchema(schema), wasWf));
  if (gate) return { error: gate };
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
      require_approved_device: deviceLock(requireDevice, vis),
      device_scope: deviceScopeOf(requireDevice, vis, deviceScope),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .select("id")
    .single();

  if (error) return { error: error.message };

  // ซิงก์ชื่อ/ไอคอนไปยัง submissions เดิม เพื่อให้ทุกหน้า (dashboard/ประวัติ/อนุมัติ) แสดงชื่อใหม่ตรงกัน
  // เฉพาะตอนที่ชื่อหรือไอคอนเปลี่ยนจริง — เดิมเขียนทับทุก submission ทุกครั้งที่กดบันทึก (ช้า + realtime ถล่ม dashboard)
  if (!before || before.title !== schema.title || before.icon !== schema.icon) {
    await supabase
      .from("submissions")
      .update({ form_title: schema.title, form_icon: schema.icon })
      .eq("form_id", id)
      .eq("tenant_id", session.tenantId);
  }

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
  rawVisibility: unknown = { mode: "all", teamIds: [], userIds: [] },
  requireDevice = false,
  deviceScope: "any" | "selected" = "any"
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
      require_approved_device: deviceLock(requireDevice, vis),
      device_scope: deviceScopeOf(requireDevice, vis, deviceScope),
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
