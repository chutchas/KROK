"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";
import { testWebhook, type WebhookEvent } from "@/lib/webhooks";

const EVENTS: WebhookEvent[] = ["submission.created", "submission.approved", "submission.rejected"];

function cleanEvents(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr.filter((e): e is string => typeof e === "string" && EVENTS.includes(e as WebhookEvent));
  return out.length ? Array.from(new Set(out)) : ["submission.created"];
}

function validUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export async function createWebhook(
  name: string,
  url: string,
  events: unknown,
  secret: string
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: "ไม่มีสิทธิ์" };
  if (!validUrl(url.trim())) return { error: "URL ไม่ถูกต้อง (ต้องขึ้นต้น http:// หรือ https://)" };

  const supabase = await createClient();
  const { error } = await supabase.from("webhooks").insert({
    tenant_id: session.tenantId,
    name: name.trim().slice(0, 80) || "Webhook",
    url: url.trim(),
    events: cleanEvents(events),
    secret: secret.trim() ? secret.trim().slice(0, 200) : null,
    created_by: session.userId,
  });
  if (error) return { error: error.message };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function toggleWebhook(id: string, active: boolean): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { error: "ไม่มีสิทธิ์" };
  const supabase = await createClient();
  const { error } = await supabase.from("webhooks").update({ active }).eq("id", id).eq("tenant_id", session.tenantId);
  if (error) return { error: error.message };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function deleteWebhook(id: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { error: "ไม่มีสิทธิ์" };
  const supabase = await createClient();
  const { error } = await supabase.from("webhooks").delete().eq("id", id).eq("tenant_id", session.tenantId);
  if (error) return { error: error.message };
  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function testWebhookById(id: string): Promise<{ ok: boolean; status: string }> {
  const session = await getSession();
  if (!session || !canManage(session.role)) return { ok: false, status: "unauthorized" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("webhooks")
    .select("url, secret")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!data) return { ok: false, status: "not found" };
  const res = await testWebhook(data.url as string, (data.secret as string) ?? null);
  await supabase
    .from("webhooks")
    .update({ last_status: `test ${res.status}`, last_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  revalidatePath("/settings/integrations");
  return res;
}
