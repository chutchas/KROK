"use server";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { cleanMenus } from "@/lib/menus";

async function requireWsAdmin() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "unauthorized" };
  if (session.role !== "owner" && session.role !== "admin")
    return { ok: false as const, error: await sm("เฉพาะ owner/admin เท่านั้น") };
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
  if (!clean) return { error: await sm("ต้องระบุชื่อ role") };
  if (clean.length > 40) return { error: await sm("ชื่อยาวเกินไป") };

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
  if (error) return { error: await sm(dbError(error)) };
  revalidatePath("/settings/roles");
  return { ok: true };
}

export async function updateRole(
  key: string,
  patch: { name?: string; canManage?: boolean; menus?: unknown }
): Promise<{ ok: true } | { error: string }> {
  const a = await requireWsAdmin();
  if (!a.ok) return { error: a.error };
  if (key === "owner") return { error: await sm("แก้ role Owner ไม่ได้") };

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
  if (error) return { error: await sm(dbError(error)) };
  // สิทธิ์จริงที่ RLS ใช้ = memberships.role (enum) — ต้องซิงก์ตาม can_manage ทุกครั้ง
  // ไม่งั้นถอดสิทธิ์จัดการแล้วสมาชิกยังเขียนข้อมูลผ่าน REST ได้ (หรือให้สิทธิ์แล้วยังใช้ไม่ได้)
  if (typeof patch.canManage === "boolean") {
    const { error: syncErr } = await supabase
      .from("memberships")
      .update({ role: patch.canManage ? "admin" : "operator" })
      .eq("tenant_id", a.session.tenantId)
      .eq("role_key", key)
      .neq("role", "owner");
    if (syncErr) return { error: await sm(dbError(syncErr)) };
  }
  revalidatePath("/settings/roles");
  revalidatePath("/settings/team");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteRole(key: string): Promise<{ ok: true } | { error: string }> {
  const a = await requireWsAdmin();
  if (!a.ok) return { error: a.error };

  const supabase = await createClient();
  const { data: role } = await supabase
    .from("tenant_roles").select("is_system").eq("tenant_id", a.session.tenantId).eq("key", key).maybeSingle();
  if (!role) return { error: await sm("ไม่พบ role") };
  if (role.is_system) return { error: await sm("ลบ role ระบบไม่ได้ (Owner/Admin/User)") };

  // ย้ายสมาชิกที่ใช้ role นี้กลับเป็น User
  await supabase.from("memberships").update({ role: "operator", role_key: "user" }).eq("tenant_id", a.session.tenantId).eq("role_key", key);
  const { error } = await supabase.from("tenant_roles").delete().eq("tenant_id", a.session.tenantId).eq("key", key);
  if (error) return { error: await sm(dbError(error)) };
  revalidatePath("/settings/roles");
  revalidatePath("/settings/team");
  return { ok: true };
}
