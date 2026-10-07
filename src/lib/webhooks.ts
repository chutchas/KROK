import "server-only";
import crypto from "crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { webhookAllowance } from "@/lib/quota";
import { filterAnswersByFields } from "@/lib/webhook-utils";
import { safeFetch } from "@/lib/safe-fetch";

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
 * POST ไปยัง URL ที่ผู้ใช้ตั้งไว้ ผ่าน safeFetch (กัน SSRF: ห้ามยิงเข้า IP ภายใน / metadata ของ cloud)
 * ไม่อ่าน response body เกิน 64KB — สนใจแค่ status
 */
async function post(url: string, headers: Record<string, string>, body: string): Promise<number> {
  const res = await safeFetch(url, { method: "POST", headers, body, timeoutMs: 8000, maxBytes: 64 * 1024 });
  return res.status;
}

export interface DeliveryResult {
  /** ข้อความสั้นเก็บใน webhooks.last_status (เข้ากันกับของเดิม) */
  label: string;
  status: number | null;
  ok: boolean;
  attempts: number;
  error: string | null;
  durationMs: number;
}

/**
 * ยิง POST พร้อม retry: ลองสูงสุด 3 ครั้ง (1 + 2 retry)
 * retry เมื่อ network error / timeout / HTTP 5xx / 429 — หยุดทันทีถ้า 2xx-4xx อื่น
 * backoff (1s, 4s) — รันใน after() หลังตอบผู้ใช้แล้ว จึงไม่ถ่วง request
 */
async function postWithRetry(url: string, headers: Record<string, string>, body: string, attempts = 3): Promise<DeliveryResult> {
  const t0 = Date.now();
  let res: DeliveryResult = { label: "", status: null, ok: false, attempts: 0, error: null, durationMs: 0 };
  for (let i = 0; i < attempts; i++) {
    try {
      const status = await post(url, headers, body);
      const retryable = status >= 500 || status === 429;
      res = { label: i > 0 ? `${status} (attempt ${i + 1})` : `${status}`, status, ok: status >= 200 && status < 300, attempts: i + 1, error: null, durationMs: 0 };
      if (!retryable) break; // สำเร็จหรือ error ฝั่ง client → ไม่ลองซ้ำ
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 80) : "failed";
      res = { label: "error: " + msg, status: null, ok: false, attempts: i + 1, error: msg, durationMs: 0 };
    }
    if (i < attempts - 1) await sleep(i === 0 ? 1000 : 4000);
  }
  res.durationMs = Date.now() - t0;
  return res;
}

/** header มาตรฐานของการส่ง 1 ครั้ง: delivery id + timestamp + ลายเซ็น (v1 = body · v2 = "<timestamp>.<body>" กันยิงซ้ำ) */
export function signedHeaders(event: string, body: string, secret: string | null, deliveryId: string, ts: number): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "KROK-Webhook/1.1",
    "X-KROK-Event": event,
    "X-KROK-Delivery": deliveryId,
    "X-KROK-Timestamp": String(ts),
  };
  if (secret) {
    headers["X-KROK-Signature"] = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
    headers["X-KROK-Signature-V2"] = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  }
  return headers;
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
  if (!admin) {
    console.warn("[KROK] SUPABASE_SERVICE_ROLE_KEY ไม่ได้ตั้งค่า — ข้ามการส่ง webhook");
    return;
  }

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
  // แพ็กเกจปัจจุบัน: ไม่รวม webhook = หยุดทั้งหมด · เกินโควตา = ส่งเฉพาะเส้นแรก ๆ ที่สร้างไว้
  const allow = await webhookAllowance(tenantId).catch(() => "all" as const);
  if (allow === "none") return;
  if (allow !== "all") {
    const kept = hooks.filter((h) => allow.has(h.id));
    if (kept.length === 0) return;
    hooks.splice(0, hooks.length, ...kept);
  }

  // ต้องจับคู่ answers กับ field id เฉพาะเมื่อมี webhook ที่เลือกฟิลด์ + payload มี answers
  const answers = Array.isArray((payload as { answers?: unknown[] }).answers)
    ? ((payload as { answers?: unknown[] }).answers as unknown[])
    : null;
  // คำตอบรุ่นใหม่มี id ในตัว → ไม่ต้องพึ่ง schema ปัจจุบัน (ซึ่งอาจถูกแก้ไปแล้ว)
  const hasIds = !!answers && answers.some((a) => !!a && typeof a === "object" && typeof (a as { id?: unknown }).id === "string");
  const needFieldMap = !hasIds && !!formId && !!answers && hooks.some((h) => Array.isArray(h.fields) && h.fields.length > 0);
  const fieldIds = needFieldMap ? await formFieldIds(admin, formId as string) : [];

  const sentAt = new Date().toISOString();
  const fullBody = JSON.stringify({ event, sent_at: sentAt, data: payload });

  await Promise.all(
    hooks.map(async (h) => {
      // เลือกฟิลด์ → สร้าง body เฉพาะของ webhook นี้ (กรองด้วย id ของคำตอบ · ข้อมูลเก่าไม่มี id = จับคู่ตามลำดับ)
      let body = fullBody;
      if (answers && Array.isArray(h.fields) && h.fields.length > 0) {
        const filtered = filterAnswersByFields(answers, fieldIds, h.fields);
        body = JSON.stringify({ event, sent_at: sentAt, data: { ...payload, answers: filtered } });
      }
      const deliveryId = crypto.randomUUID();
      const r = await postWithRetry(h.url, signedHeaders(event, body, h.secret, deliveryId, Math.floor(Date.now() / 1000)), body);
      await admin.from("webhooks").update({ last_status: r.label, last_at: new Date().toISOString() }).eq("id", h.id);
      await logDelivery(admin, { id: deliveryId, tenant_id: tenantId, webhook_id: h.id, event, r });
    })
  );
}

type Admin = NonNullable<ReturnType<typeof getAdminClient>>;

/** บันทึกประวัติการส่ง (ยังไม่รัน 0043 = ไม่มีตาราง → ข้าม) + ล้างของเก่ากว่า 30 วันเป็นครั้งคราว */
async function logDelivery(admin: Admin, d: { id: string; tenant_id: string; webhook_id: string; event: string; r: DeliveryResult }) {
  try {
    await admin.from("webhook_deliveries").insert({
      id: d.id, tenant_id: d.tenant_id, webhook_id: d.webhook_id, event: d.event,
      status: d.r.status, ok: d.r.ok, attempts: d.r.attempts, error: d.r.error, duration_ms: d.r.durationMs,
    });
    if (Math.random() < 0.05) {
      await admin.from("webhook_deliveries").delete().lt("created_at", new Date(Date.now() - 30 * 86400_000).toISOString());
    }
  } catch { /* best-effort */ }
}

/** ยิงทดสอบไปยัง URL เดียว (จากหน้า integrations) — ไม่ retry */
export async function testWebhook(url: string, secret: string | null): Promise<{ ok: boolean; status: string }> {
  const body = JSON.stringify({
    event: "test",
    sent_at: new Date().toISOString(),
    data: { message: "KROK webhook test", ok: true },
  });
  try {
    const status = await post(url, signedHeaders("test", body, secret, crypto.randomUUID(), Math.floor(Date.now() / 1000)), body);
    return { ok: status >= 200 && status < 300, status: `HTTP ${status}` };
  } catch (e) {
    return { ok: false, status: e instanceof Error ? e.message.slice(0, 120) : "failed" };
  }
}
