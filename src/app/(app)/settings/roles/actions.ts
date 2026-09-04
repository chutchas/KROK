"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { cleanMenus } from "@/lib/menus";

async function requireWsAdmin() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "unauthorized" };
  if (session.role !== "owner" && session.role !== "admin")
    return { ok: false as const, error: "เฉพาะ owner/admin เท่านั้น" };
  return { ok: true as const, session };
}

function slugify(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return (base || "role") + "-" + Math.random().toString(36).slice(2, 6);
}

export async function createRole(name: string, canManage: boolean, menus: unknown): Promise<{ ok: true } | { error: string }> {
  const a = await requireWsAdmin();
  if (!a.ok) return { error: a.error };
  const clean = name.trim();
  if (!clean) return { error: "ต้องระบุชื่อ role" };
  if (clean.length > 40) return { error: "ชื่อยาวเกินไป" };

  const supabase = await createClient();
  const { error } = await supabase.from("tenant_roles").insert({
    tenant_id: a.session.tenantId,
    key: slugify(clean),
    name: clean,
    can_manage: !!canManage,
    menus: cleanMenus(menus),
    is_system: false,
    sort: 100,
  });
  if (error) return { error: error.message };
  revalidatePath("/settings/roles");
  return { ok: true };
}

export async function updateRole(
  key: string,
  patch: { name?: string; canManage?: boolean; menus?: unknown }
): Promise<{ ok: true } | { error: string }> {
  const a = await requireWsAdmin();
  if (!a.ok) return { error: a.error };
  if (key === "owner") return { error: "แก้ role Owner ไม่ได้" };

  const supabase = await createClient();
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.name === "string" && patch.name.trim()) upd.name = patch.name.trim().slice(0, 40);
  if (typeof patch.canManage === "boolean") upd.can_manage = patch.canManage;
  if (patch.menus !== undefined) upd.menus = cleanMenus(patch.menus);

  const { error } = await supabase
    .from("tenant_roles")
    .update(upd)
    .eq("tenant_id", a.session.tenantId)
    .eq("key", key);
  if (error) return { error: error.message };
  revalidatePath("/settings/roles");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteRole(key: string): Promise<{ ok: true } | { error: string }> {
  const a = await requireWsAdmin();
  if (!a.ok) return { error: a.error };

  const supabase = await createClient();
  const { data: role } = await supabase
    .from("tenant_roles").select("is_system").eq("tenant_id", a.session.tenantId).eq("key", key).maybeSingle();
  if (!role) return { error: "ไม่พบ role" };
  if (role.is_system) return { error: "ลบ role ระบบไม่ได้ (Owner/Admin/User)" };

  // ย้ายสมาชิกที่ใช้ role นี้กลับเป็น User
  await supabase.from("memberships").update({ role: "operator", role_key: "user" }).eq("tenant_id", a.session.tenantId).eq("role_key", key);
  const { error } = await supabase.from("tenant_roles").delete().eq("tenant_id", a.session.tenantId).eq("key", key);
  if (error) return { error: error.message };
  revalidatePath("/settings/roles");
  revalidatePath("/settings/team");
  return { ok: true };
}
