"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

const BUCKET = "drafts";

/** ลบแบบร่างของตัวเอง (รวมไฟล์) — RLS กันไม่ให้ลบของคนอื่น */
export async function deleteDraftAction(id: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("submission_drafts")
    .select("id, media")
    .eq("id", id)
    .eq("user_id", session.userId)
    .maybeSingle();
  if (!data) return { error: "ไม่พบแบบร่าง" };
  const paths = Object.values((data.media as Record<string, string>) || {});
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from("submission_drafts").delete().eq("id", id).eq("user_id", session.userId);
  if (error) return { error: error.message };
  revalidatePath("/forms");
  return { ok: true };
}

/** ลบแบบร่างที่ส่งไปแล้วตอนออฟไลน์ (id ที่เครื่องจำไว้) */
export async function deleteSubmittedDrafts(ids: string[]): Promise<{ ok: true }> {
  const session = await getSession();
  if (!session) return { ok: true };
  const clean = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100);
  if (!clean.length) return { ok: true };
  const supabase = await createClient();
  const { data } = await supabase.from("submission_drafts").select("id, media").in("id", clean).eq("user_id", session.userId);
  const paths = ((data || []) as { media: Record<string, string> }[]).flatMap((d) => Object.values(d.media || {}));
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  await supabase.from("submission_drafts").delete().in("id", clean).eq("user_id", session.userId);
  revalidatePath("/forms");
  return { ok: true };
}
