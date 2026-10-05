import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { pushGroupOf, cleanOffGroups } from "@/lib/push-types";
import { siteOrigin } from "@/lib/site-origin";

// ============================================================
// Web Push ฝั่ง server (0067)
// env: NEXT_PUBLIC_VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · VAPID_SUBJECT (ไม่ตั้ง = mailto จาก NEXT_PUBLIC_PRIVACY_EMAIL)
// รหัสยืนยันที่ DB ใช้เรียก /api/push/dispatch = HMAC ของ private key (ไม่ต้องตั้ง env เพิ่ม)
// ============================================================

export function vapidKeys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const mail = process.env.VAPID_SUBJECT?.trim() || (process.env.NEXT_PUBLIC_PRIVACY_EMAIL?.trim() ? `mailto:${process.env.NEXT_PUBLIC_PRIVACY_EMAIL.trim()}` : "mailto:admin@example.com");
  return { publicKey, privateKey, subject: mail };
}

export function dispatchSecret(): string | null {
  const k = vapidKeys();
  return k ? createHmac("sha256", k.privateKey).update("krok-push-dispatch-v1").digest("hex") : null;
}

export function checkDispatchSecret(given: string | null): boolean {
  const want = dispatchSecret();
  if (!want || !given || given.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

/** ให้ DB รู้ปลายทาง + รหัส (ตั้งเองตอนมีคนเปิดแจ้งเตือน) · คืน false ถ้าตั้งไม่ได้ (ยังไม่รัน 0067) */
export async function ensurePushConfig(admin: SupabaseClient): Promise<boolean> {
  const secret = dispatchSecret();
  if (!secret) return false;
  const url = `${await siteOrigin()}/api/push/dispatch`;
  const { data, error } = await admin.from("push_config").select("dispatch_url, secret").eq("id", true).maybeSingle();
  if (error) return false;
  if (data && data.dispatch_url === url && data.secret === secret) return true;
  const { error: e2 } = await admin.from("push_config").upsert({ id: true, dispatch_url: url, secret, updated_at: new Date().toISOString() });
  return !e2;
}

export interface PushPayload { title: string; body: string; url: string; tag?: string }

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string; fail_count: number };

/** ส่งไปทุกเครื่องของผู้ใช้ · เครื่องที่ยกเลิกแล้ว (404/410) ลบทิ้ง · คืนจำนวนที่ส่งสำเร็จ */
export async function sendToUser(admin: SupabaseClient, userId: string, payload: PushPayload, onlyEndpoint?: string): Promise<{ sent: number; failed: number; devices: number }> {
  const k = vapidKeys();
  if (!k) return { sent: 0, failed: 0, devices: 0 };
  webpush.setVapidDetails(k.subject, k.publicKey, k.privateKey);
  let q = admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, fail_count").eq("user_id", userId).limit(20);
  if (onlyEndpoint) q = q.eq("endpoint", onlyEndpoint);
  const { data } = await q;
  const subs = (data || []) as SubRow[];
  const body = JSON.stringify({ ...payload, title: payload.title.slice(0, 120), body: payload.body.slice(0, 240) });
  let sent = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 6 * 3600, urgency: "high" });
      sent++;
      await admin.from("push_subscriptions").update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq("id", s.id);
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      // เครื่องยกเลิก/หมดอายุ หรือพลาดติดกันหลายครั้ง → ลบ
      if (code === 404 || code === 410 || s.fail_count >= 9) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else await admin.from("push_subscriptions").update({ fail_count: s.fail_count + 1 }).eq("id", s.id);
    }
  }));
  return { sent, failed, devices: subs.length };
}

/** แจ้งเตือน 1 แถว → push (ข้ามถ้าเก่าเกิน 30 นาที / ผู้ใช้ปิดประเภทนี้) */
export async function pushNotification(admin: SupabaseClient, id: string): Promise<{ sent: number; skipped?: string }> {
  const { data: n } = await admin.from("notifications").select("user_id, type, title, body, link, created_at").eq("id", id).maybeSingle();
  if (!n) return { sent: 0, skipped: "not_found" };
  if (Date.now() - Date.parse(n.created_at as string) > 30 * 60_000) return { sent: 0, skipped: "stale" };
  const group = pushGroupOf(n.type as string);
  if (group) {
    const { data: pref } = await admin.from("push_prefs").select("off_types").eq("user_id", n.user_id).maybeSingle();
    if (cleanOffGroups(pref?.off_types).includes(group)) return { sent: 0, skipped: "pref_off" };
  }
  const link = typeof n.link === "string" && n.link.startsWith("/") ? n.link : "/dashboard";
  const r = await sendToUser(admin, n.user_id as string, { title: (n.title as string) || "KROK", body: (n.body as string) || "", url: link, tag: id });
  return { sent: r.sent };
}
