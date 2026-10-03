"use client";
// อัปโหลดรูปแบรนด์ (โลโก้ / รูปประกอบบนกระดาษ) ไป bucket "branding" (อ่านสาธารณะ)
// ไม่รับ SVG (อาจมีสคริปต์) · ≤ 2MB · เขียนได้เฉพาะผู้จัดการ/ผู้ออกแบบของ workspace (RLS ใน 0056)
import { createClient } from "@/lib/supabase/client";

export const BRAND_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const BRAND_IMAGE_MAX = 2 * 1024 * 1024;
export const BRAND_IMAGE_ACCEPT = BRAND_IMAGE_TYPES.join(",");

export type BrandUploadError = "type" | "size" | "failed";

export function checkBrandImage(file: { type: string; size: number }): BrandUploadError | null {
  if (!(BRAND_IMAGE_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > BRAND_IMAGE_MAX) return "size";
  return null;
}

/** คืน URL สาธารณะของไฟล์ หรือรหัสข้อผิดพลาด */
export async function uploadBrandImage(file: File, tenantId: string, prefix: "logo" | "img"): Promise<{ url: string } | { error: BrandUploadError }> {
  const bad = checkBrandImage(file);
  if (bad) return { error: bad };
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${tenantId}/${prefix}-${crypto.randomUUID()}.${ext}`;
  try {
    const supabase = createClient();
    const { error } = await supabase.storage.from("branding").upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (error) return { error: "failed" };
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    return data?.publicUrl ? { url: data.publicUrl } : { error: "failed" };
  } catch {
    return { error: "failed" };
  }
}
