import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypass RLS. ใช้ฝั่ง server เท่านั้น
// สำหรับอ่าน api_key ของ LLM ที่ client เข้าถึงไม่ได้
// ต้องตั้ง env SUPABASE_SERVICE_ROLE_KEY (server secret) จึงจะใช้ได้
let cached: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (cached) return cached;
  cached = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
