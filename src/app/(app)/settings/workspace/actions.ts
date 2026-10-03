"use server";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { canManage, getSession, WS_COOKIE } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { brandAssetUses, getBrandLibrary, removeAllBrandFiles, type BrandAsset } from "@/lib/branding-library";
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

  await writeAudit({
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

  // ไฟล์โลโก้/รูปของ workspace ใน storage ไม่ถูกลบตามตาราง — ลบทั้งโฟลเดอร์ (ลบ workspace สำเร็จแล้วเท่านั้น)
  const admin = getAdminClient();
  if (admin) {
    try { await removeAllBrandFiles(admin, session.tenantId); } catch (e) { console.error("[krok] branding cleanup failed:", e); }
  }

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

  await writeAudit({
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

/** คลังรูปของ workspace + ใช้ที่ไหน (ผู้จัดการ/ผู้ออกแบบ — ใช้เลือกรูปซ้ำในหน้าสร้างฟอร์มด้วย) */
export async function listBrandLibrary(): Promise<{ assets: BrandAsset[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์" };
  try {
    const supabase = await createClient();
    return { assets: await getBrandLibrary(supabase, getAdminClient() ?? supabase, session.tenantId) };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { error: /bucket|not found/i.test(m) ? "ยังไม่ได้รัน migration 0056_branding" : m };
  }
}

/**
 * ลบรูปออกจากคลัง (owner/admin) — ตรวจการใช้งานใหม่ฝั่ง server ทุกครั้ง รูปที่ยังใช้อยู่จะไม่ถูกลบ
 * คืนจำนวนที่ลบ + รายการที่ข้ามเพราะยังใช้อยู่
 */
export async function deleteBrandAssets(paths: string[]): Promise<{ deleted: number; skipped: string[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (session.role !== "owner" && session.role !== "admin") return { error: "เฉพาะ owner/admin เท่านั้นที่ลบรูปได้" };
  const prefix = `${session.tenantId}/`;
  const wanted = [...new Set(paths)].filter((p) => typeof p === "string" && p.startsWith(prefix) && !p.includes("..") && !p.slice(prefix.length).includes("/")).slice(0, 500);
  if (!wanted.length) return { deleted: 0, skipped: [] };

  const supabase = await createClient();
  let uses: Map<string, unknown[]>;
  try {
    uses = await brandAssetUses(getAdminClient() ?? supabase, session.tenantId);
  } catch {
    return { error: "ตรวจการใช้งานรูปไม่สำเร็จ — ยังไม่ลบ" };
  }
  const skipped = wanted.filter((p) => (uses.get(p)?.length ?? 0) > 0);
  const del = wanted.filter((p) => !skipped.includes(p));
  if (del.length) {
    const { error } = await supabase.storage.from("branding").remove(del);
    if (error) return { error: error.message };
    await writeAudit({
      tenant_id: session.tenantId,
      actor_id: session.userId,
      action: "workspace.branding.delete_files",
      target_type: "tenant",
      target_id: session.tenantId,
      meta: { count: del.length, files: del.map((p) => p.slice(prefix.length)).slice(0, 50) },
    });
  }
  revalidatePath("/settings/workspace");
  return { deleted: del.length, skipped };
}
