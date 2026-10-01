import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * จำกัดความถี่ต่อผู้ใช้ (atomic ผ่าน RPC hit_rate_limit — migration 0016, เรียกได้เฉพาะ service role)
 * คืน true = เกินกำหนด ให้ตอบ 429 · ไม่มี RPC/ผิดพลาด → ไม่บล็อก (best-effort)
 */
export async function rateLimited(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const admin = getAdminClient();
  if (!admin) return false;
  try {
    const { data, error } = await admin.rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    return !error && data === false;
  } catch {
    return false;
  }
}

/** ปุ่ม AI: กันกดรัว/สคริปต์ยิงถี่ — 20 ครั้ง/นาที/ผู้ใช้/ชนิดงาน (โควตารายเดือนยังคุมยอดรวมอยู่) */
export function aiRateLimited(userId: string, purpose: string): Promise<boolean> {
  return rateLimited(`ai:${purpose}:${userId}`, 20, 60);
}
