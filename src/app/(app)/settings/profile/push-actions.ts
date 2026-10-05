"use server";
import { sm } from "@/lib/server-msg";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { ensurePushConfig, sendToUser, vapidKeys } from "@/lib/push-server";
import { cleanOffGroups, type PushGroup } from "@/lib/push-types";

export interface PushState {
  /** ตั้ง VAPID แล้ว (ผู้ดูแลระบบ) */
  configured: boolean;
  /** ยังไม่รัน 0067 */
  missing: boolean;
  publicKey: string | null;
  offGroups: PushGroup[];
  devices: { id: string; endpoint: string; ua: string; createdAt: string; lastOkAt: string | null }[];
}

export async function getPushState(): Promise<PushState | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  const k = vapidKeys();
  const supabase = await createClient();
  const [subs, pref] = await Promise.all([
    supabase.from("push_subscriptions").select("id, endpoint, ua, created_at, last_ok_at").eq("user_id", session.userId).order("created_at", { ascending: false }),
    supabase.from("push_prefs").select("off_types").eq("user_id", session.userId).maybeSingle(),
  ]);
  return {
    configured: !!k,
    missing: !!subs.error,
    publicKey: k?.publicKey ?? null,
    offGroups: cleanOffGroups(pref.data?.off_types),
    devices: ((subs.data || []) as Record<string, unknown>[]).map((d) => ({ id: d.id as string, endpoint: d.endpoint as string, ua: (d.ua as string) || "", createdAt: d.created_at as string, lastOkAt: (d.last_ok_at as string) ?? null })),
  };
}

const okUrl = (u: unknown) => typeof u === "string" && /^https:\/\/[^\s]{10,1000}$/.test(u);
const okKey = (k: unknown, max: number) => typeof k === "string" && /^[A-Za-z0-9_\-=]+$/.test(k) && k.length <= max;

/** บันทึกเครื่องนี้ (subscription จาก pushManager) · endpoint เดิมของคนอื่น (เครื่องใช้ร่วม) ย้ายมาเป็นของคนนี้ */
export async function savePushSubscription(sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }, ua: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!vapidKeys()) return { error: await sm("ระบบยังไม่ได้ตั้งค่าแจ้งเตือนเด้ง (VAPID) — ติดต่อผู้ดูแลระบบ") };
  if (!okUrl(sub?.endpoint) || !okKey(sub?.keys?.p256dh, 200) || !okKey(sub?.keys?.auth, 100)) return { error: await sm("ข้อมูลการแจ้งเตือนของเครื่องไม่ถูกต้อง") };
  const admin = getAdminClient();
  if (!admin) return { error: await sm("ระบบยังไม่ได้ตั้งค่าแจ้งเตือนเด้ง (VAPID) — ติดต่อผู้ดูแลระบบ") };
  const { error } = await admin.from("push_subscriptions").upsert({
    user_id: session.userId, endpoint: sub.endpoint as string, p256dh: sub.keys!.p256dh as string, auth: sub.keys!.auth as string,
    ua: String(ua || "").slice(0, 200), fail_count: 0,
  }, { onConflict: "endpoint" });
  if (error) return { error: await sm("บันทึกไม่สำเร็จ โปรดลองใหม่") };
  await ensurePushConfig(admin);
  return { ok: true };
}

export async function removePushSubscription(idOrEndpoint: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  const supabase = await createClient();
  const col = idOrEndpoint.startsWith("https://") ? "endpoint" : "id";
  await supabase.from("push_subscriptions").delete().eq("user_id", session.userId).eq(col, idOrEndpoint);
  return { ok: true };
}

export async function setPushPrefs(off: string[]): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase.from("push_prefs").upsert({ user_id: session.userId, off_types: cleanOffGroups(off), updated_at: new Date().toISOString() });
  if (error) return { error: await sm("บันทึกไม่สำเร็จ โปรดลองใหม่") };
  return { ok: true };
}

/** ส่งทดสอบไปเครื่องนี้ตรง ๆ (ไม่ผ่าน DB) — ใช้เช็กว่าเครื่องรับได้ */
export async function sendTestPush(endpoint: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  const admin = getAdminClient();
  if (!admin || !vapidKeys()) return { error: await sm("ระบบยังไม่ได้ตั้งค่าแจ้งเตือนเด้ง (VAPID) — ติดต่อผู้ดูแลระบบ") };
  const r = await sendToUser(admin, session.userId, { title: "KROK", body: "ทดสอบแจ้งเตือน — เครื่องนี้รับแจ้งเตือนได้แล้ว", url: "/settings/profile", tag: "krok-test" }, endpoint);
  if (!r.devices) return { error: await sm("ไม่พบเครื่องนี้ในรายการ — กดเปิดแจ้งเตือนอีกครั้ง") };
  if (!r.sent) return { error: await sm("ส่งไม่สำเร็จ — ลองปิดแล้วเปิดแจ้งเตือนใหม่") };
  return { ok: true };
}
