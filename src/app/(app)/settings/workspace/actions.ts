"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSession, WS_COOKIE } from "@/lib/session";
import { cleanImageUrl, sanitizeThemeSettings } from "@/lib/theme";

export async function renameWorkspace(name: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (session.role !== "owner" && session.role !== "admin") return { error: "ไม่มีสิทธิ์เปลี่ยนชื่อ workspace" };
  const clean = name.trim();
  if (!clean) return { error: "ชื่อ workspace ห้ามว่าง" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_workspace", { p_tenant: session.tenantId, p_name: clean });
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId,
    actor_id: session.userId,
    action: "workspace.rename",
    target_type: "tenant",
    target_id: session.tenantId,
    meta: { name: clean },
  });

  revalidatePath("/settings/workspace");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteWorkspace(confirmName: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (session.role !== "owner") return { error: "เฉพาะเจ้าของ workspace เท่านั้นที่ลบได้" };
  if (confirmName.trim() !== session.tenantName)
    return { error: "ชื่อยืนยันไม่ตรงกับชื่อ workspace" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_workspace", { p_tenant: session.tenantId });
  if (error) return { error: error.message };

  // ล้าง cookie workspace ที่เลือกไว้ → getSession จะ fallback ไป workspace แรกที่เหลือ
  const store = await cookies();
  store.delete(WS_COOKIE);

  revalidatePath("/", "layout");
  return { ok: true };
}

/** แบรนด์ของ workspace: โลโก้ + ธีมสี + ข้อความท้าย (ค่าเริ่มต้นของทุกฟอร์ม) */
export async function saveBranding(input: { logo_url?: string | null; primary?: string; header?: string; footer_text?: string }): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (session.role !== "owner" && session.role !== "admin") return { error: "ไม่มีสิทธิ์แก้แบรนด์ของ workspace" };
  const theme = sanitizeThemeSettings(input);
  const logo = cleanImageUrl(input.logo_url) ?? null;
  if (input.logo_url && !logo) return { error: "ไฟล์โลโก้ไม่ถูกต้อง" };

  const supabase = await createClient();
  const { error } = await supabase.from("tenant_branding").upsert({
    tenant_id: session.tenantId,
    logo_url: logo,
    theme,
    updated_at: new Date().toISOString(),
    updated_by: session.userId,
  });
  if (error) return { error: /tenant_branding/.test(error.message) ? "ยังไม่ได้รัน migration 0056_branding" : error.message };

  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId,
    actor_id: session.userId,
    action: "workspace.branding",
    target_type: "tenant",
    target_id: session.tenantId,
    meta: { logo: !!logo, ...theme },
  });
  revalidatePath("/settings/workspace");
  return { ok: true };
}
