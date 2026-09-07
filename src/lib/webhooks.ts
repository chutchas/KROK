import "server-only";
import crypto from "crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { filterAnswersByFields } from "@/lib/webhook-utils";

export type WebhookEvent = "submission.created" | "submission.approved" | "submission.rejected";

interface WebhookRow {
  id: string;
  url: string;
  events: string[] | null;
  secret: string | null;
  active: boolean;
  form_id: string | null;
  fields: string[] | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * ยิง POST พร้อม retry: ลองสูงสุด 3 ครั้ง (1 + 2 retry)
 * retry เมื่อ network error / timeout / HTTP 5xx / 429 — หยุดทันทีถ้า 2xx-4xx อื่น
 * backoff สั้น (300ms, 1200ms) เพราะรันใน request แบบ serverless
 */
async function postWithRetry(
  url: string,
  headers: Record<string, string>,
  body: string,
  attempts = 3
): Promise<string> {
  let last = "";
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
      clearTimeout(timer);
      const retryable = res.status >= 500 || res.status === 429;
      last = i > 0 ? `${res.status} (attempt ${i + 1})` : `${res.status}`;
      if (!retryable) return last; // สำเร็จหรือ error ฝั่ง client → ไม่ลองซ้ำ
    } catch (e) {
      last = "error: " + (e instanceof Error ? e.message.slice(0, 80) : "failed");
    }
    if (i < attempts - 1) await sleep(i === 0 ? 300 : 1200);
  }
  return last;
}

// ลำดับ field id ของฟอร์ม (flatten steps) — ใช้จับคู่กับ answers ที่เรียงลำดับเดียวกัน
async function formFieldIds(admin: NonNullable<ReturnType<typeof getAdminClient>>, formId: string): Promise<string[]> {
  const { data } = await admin.from("forms").select("schema").eq("id", formId).maybeSingle();
  const schema = (data?.schema ?? {}) as { steps?: { fields?: { id?: string }[] }[] };
  const ids: string[] = [];
  for (const s of schema.steps || []) for (const f of s.fields || []) if (f?.id) ids.push(f.id);
  return ids;
}

/**
 * ส่ง payload ไปยัง webhook ของ tenant ที่สมัครรับ event นี้
 * - ผูกฟอร์ม: ส่งเฉพาะ webhook ที่ form_id = formId หรือ form_id เป็น NULL (ทุกฟอร์ม)
 * - เลือกฟิลด์: ถ้า webhook.fields ไม่ว่าง จะกรอง data.answers ให้เหลือเฉพาะฟิลด์ที่เลือก
 * ใช้ admin client (bypass RLS) — ผู้เรียกต้องยืนยันสิทธิ์ของ tenant มาก่อน; best-effort
 */
export async function dispatchWebhooks(
  tenantId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
  formId?: string
): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;

  const { data } = await admin
    .from("webhooks")
    .select("id, url, events, secret, active, form_id, fields")
    .eq("tenant_id", tenantId)
    .eq("active", true);

  const hooks = ((data || []) as WebhookRow[]).filter(
    (h) =>
      (Array.isArray(h.events) ? h.events.includes(event) : true) &&
      (h.form_id == null || (!!formId && h.form_id === formId))
  );
  if (hooks.length === 0) return;

  // ต้องจับคู่ answers กับ field id เฉพาะเมื่อมี webhook ที่เลือกฟิลด์ + payload มี answers
  const answers = Array.isArray((payload as { answers?: unknown[] }).answers)
    ? ((payload as { answers?: unknown[] }).answers as unknown[])
    : null;
  const needFieldMap = !!formId && !!answers && hooks.some((h) => Array.isArray(h.fields) && h.fields.length > 0);
  const fieldIds = needFieldMap ? await formFieldIds(admin, formId as string) : [];

  const fullBody = JSON.stringify({ event, sent_at: new Date().toISOString(), data: payload });

  await Promise.all(
    hooks.map(async (h) => {
      // เลือกฟิลด์ → สร้าง body เฉพาะของ webhook นี้ (กรอง answers ตามลำดับ field)
      let body = fullBody;
      if (answers && Array.isArray(h.fields) && h.fields.length > 0 && fieldIds.length) {
        const filtered = filterAnswersByFields(answers, fieldIds, h.fields);
        body = JSON.stringify({ event, sent_at: new Date().toISOString(), data: { ...payload, answers: filtered } });
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "KROK-Webhook/1.0",
        "X-KROK-Event": event,
      };
      if (h.secret) {
        headers["X-KROK-Signature"] =
          "sha256=" + crypto.createHmac("sha256", h.secret).update(body).digest("hex");
      }
      const status = await postWithRetry(h.url, headers, body);
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
