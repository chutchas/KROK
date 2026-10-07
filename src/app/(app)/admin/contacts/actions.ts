"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard() {
  const s = await getSession();
  if (!s?.isPlatformAdmin) return null;
  const admin = getAdminClient();
  return admin ? { s, admin } : null;
}

export async function setContactHandled(id: string, handled: boolean): Promise<{ ok: boolean }> {
  const g = await guard();
  if (!g || !UUID_RE.test(id)) return { ok: false };
  const { error } = await g.admin.from("contact_requests").update(handled ? { handled_at: new Date().toISOString(), handled_by: g.s.userId } : { handled_at: null, handled_by: null }).eq("id", id);
  revalidatePath("/admin/contacts");
  return { ok: !error };
}

export async function deleteContact(id: string): Promise<{ ok: boolean }> {
  const g = await guard();
  if (!g || !UUID_RE.test(id)) return { ok: false };
  const { error } = await g.admin.from("contact_requests").delete().eq("id", id);
  revalidatePath("/admin/contacts");
  return { ok: !error };
}
