import type { SupabaseClient } from "@supabase/supabase-js";
import { printPhotosOf, type FormSchema, type PrintPhotos } from "@/lib/form-schema";
import { sanitizeFormTheme, type FormTheme } from "@/lib/theme";

/** ตั้งค่าการพิมพ์ของฟอร์ม: การแสดงรูป + ธีม (อ่าน schema ครั้งเดียว) */
export async function getFormPrintInfo(supabase: SupabaseClient, formId: string | null | undefined): Promise<{ pp: Required<PrintPhotos>; theme: FormTheme | undefined }> {
  if (!formId) return { pp: printPhotosOf({}), theme: undefined };
  const { data } = await supabase.from("forms").select("schema").eq("id", formId).maybeSingle();
  const sc = data?.schema as Partial<FormSchema> | null;
  return { pp: printPhotosOf({ print_photos: sc?.print_photos }), theme: sanitizeFormTheme(sc?.theme) };
}
