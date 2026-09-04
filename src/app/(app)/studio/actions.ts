"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";
import { sanitizeSchema, countFields, type FormSchema } from "@/lib/form-schema";
import { sanitizeChain } from "@/lib/approval";

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
  mode: "all" | "teams" | "users";
  teamIds: string[];
  userIds: string[];
}

function sanitizeVisibility(v: unknown): Visibility {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const mode = o.mode === "teams" || o.mode === "users" ? o.mode : "all";
  const asIds = (x: unknown) =>
    Array.isArray(x) ? Array.from(new Set(x.filter((s): s is string => typeof s === "string"))) : [];
  return {
    mode,
    teamIds: mode === "teams" ? asIds(o.teamIds) : [],
    userIds: mode === "users" ? asIds(o.userIds) : [],
  };
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
