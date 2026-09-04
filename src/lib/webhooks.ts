import "server-only";
import crypto from "crypto";
import { getAdminClient } from "@/lib/supabase/admin";

export type WebhookEvent = "submission.created" | "submission.approved" | "submission.rejected";

interface WebhookRow {
  id: string;
  url: string;
  events: string[] | null;
  secret: string | null;
  active: boolean;
}

/**
 * ส่ง payload ไปยัง webhook ทั้งหมดของ tenant ที่สมัครรับ event นี้
 * ใช้ admin client (bypass RLS) — ผู้เรียกต้องยืนยันสิทธิ์ของ tenant มาก่อน
 * ทำงานแบบ best-effort (ไม่ throw), จับ timeout ต่อ endpoint
 */
export async function dispatchWebhooks(
  tenantId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;

  const { data } = await admin
    .from("webhooks")
    .select("id, url, events, secret, active")
    .eq("tenant_id", tenantId)
    .eq("active", true);

  const hooks = ((data || []) as WebhookRow[]).filter((h) =>
    Array.isArray(h.events) ? h.events.includes(event) : true
  );
  if (hooks.length === 0) return;

  const body = JSON.stringify({ event, sent_at: new Date().toISOString(), data: payload });

  await Promise.all(
    hooks.map(async (h) => {
      let status = "";
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "KROK-Webhook/1.0",
          "X-KROK-Event": event,
        };
        if (h.secret) {
          headers["X-KROK-Signature"] =
            "sha256=" + crypto.createHmac("sha256", h.secret).update(body).digest("hex");
        }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(h.url, { method: "POST", headers, body, signal: ctrl.signal });
        clearTimeout(timer);
        status = `${res.status}`;
      } catch (e) {
        status = "error: " + (e instanceof Error ? e.message.slice(0, 80) : "failed");
      }
      await admin.from("webhooks").update({ last_status: status, last_at: new Date().toISOString() }).eq("id", h.id);
    })
  );
}

/** ยิงทดสอบไปยัง URL เดียว (จากหน้า integrations) */
export async function testWebhook(url: string, secret: string | null): Promise<{ ok: boolean; status: string }> {
  const body = JSON.stringify({
    event: "test",
    sent_at: new Date().toISOString(),
    data: { message: "KROK webhook test", ok: true },
  });
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "KROK-Webhook/1.0",
      "X-KROK-Event": "test",
    };
    if (secret) headers["X-KROK-Signature"] = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
    clearTimeout(timer);
    return { ok: res.ok, status: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: e instanceof Error ? e.message.slice(0, 120) : "failed" };
  }
}
