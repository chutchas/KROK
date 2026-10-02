import type { SupabaseClient } from "@supabase/supabase-js";
import { printPhotosOf, type FormSchema, type PrintPhotos } from "@/lib/form-schema";

/** การแสดงรูปถ่ายตอนพิมพ์ของฟอร์ม (อ่านจาก schema ปัจจุบันของฟอร์ม) — หาไม่เจอ = thumb */
export async function getFormPrintPhotos(supabase: SupabaseClient, formId: string | null | undefined): Promise<Required<PrintPhotos>> {
  if (!formId) return printPhotosOf({});
  const { data } = await supabase.from("forms").select("schema").eq("id", formId).maybeSingle();
  return printPhotosOf({ print_photos: (data?.schema as Partial<FormSchema> | null)?.print_photos });
}
