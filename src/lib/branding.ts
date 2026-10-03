import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanImageUrl, sanitizeThemeSettings, type WorkspaceBranding } from "@/lib/theme";

/**
 * แบรนด์ของ workspace (โลโก้ + ธีมสี + ข้อความท้าย) จากตาราง tenant_branding
 * ยังไม่ได้รัน migration 0056 / ยังไม่เคยตั้ง / อ่านไม่ได้ → null (ฟอร์มใช้สีของแอปตามเดิม)
 * client: ผู้ใช้ที่ล็อกอิน (RLS) หรือ admin client (ฟอร์มสาธารณะ / PDF)
 */
export async function getWorkspaceBranding(client: SupabaseClient | null | undefined, tenantId: string | null | undefined): Promise<WorkspaceBranding | null> {
  if (!client || !tenantId) return null;
  try {
    const { data, error } = await client
      .from("tenant_branding")
      .select("logo_url, theme")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error || !data) return null;
    return rowToBranding(data as { logo_url: unknown; theme: unknown });
  } catch {
    return null;
  }
}

export function rowToBranding(row: { logo_url: unknown; theme: unknown }): WorkspaceBranding {
  return { ...sanitizeThemeSettings(row.theme), logo_url: cleanImageUrl(row.logo_url) ?? null };
}
