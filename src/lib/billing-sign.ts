// ============================================================
// KROK · ลายเซ็นของ callback จาก Payment Gateway กลาง (pure — ทดสอบได้)
// รูปแบบ: X-Gateway-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>
//         X-Gateway-Timestamp: <unix seconds> — ต่างจากเวลาปัจจุบันเกิน 5 นาที = ปฏิเสธ (กันยิงซ้ำ)
// ============================================================
import { createHmac, timingSafeEqual } from "crypto";

export const SIGNATURE_TOLERANCE_S = 300;

export function signGatewayPayload(secret: string, timestamp: string | number, rawBody: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing" | "stale" | "mismatch" };

export function verifyGatewaySignature(
  secret: string,
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  nowS = Math.floor(Date.now() / 1000)
): VerifyResult {
  if (!secret || !timestamp || !signature || !/^\d{9,11}$/.test(timestamp)) return { ok: false, reason: "missing" };
  if (Math.abs(nowS - Number(timestamp)) > SIGNATURE_TOLERANCE_S) return { ok: false, reason: "stale" };
  const expected = Buffer.from(signGatewayPayload(secret, timestamp, rawBody));
  const got = Buffer.from(signature.trim());
  return got.length === expected.length && timingSafeEqual(got, expected) ? { ok: true } : { ok: false, reason: "mismatch" };
}

/** เหตุการณ์ที่ Gateway ส่งมา (เฉพาะช่องที่ KROK ใช้) */
export interface GatewayEvent {
  id: string;
  type: string;
  data: {
    payment_id: string;
    /** = invoices.id ของ KROK */
    reference: string;
    /** สตางค์ */
    amount: number;
    currency: string;
    method?: string;
    paid_at?: string;
    /** บัตรที่ Gateway เก็บไว้ (เมื่อขอ save_payment_method / เปลี่ยนบัตร) */
    payment_method?: { id: string; type: string; label: string | null };
    failure_reason?: string;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ตรวจรูปแบบ payload — คืน null ถ้าไม่ครบ */
export function parseGatewayEvent(raw: unknown): GatewayEvent | null {
  const o = raw as Record<string, unknown> | null;
  const d = o?.data as Record<string, unknown> | undefined;
  if (!o || typeof o.id !== "string" || !o.id || o.id.length > 200 || typeof o.type !== "string" || !d) return null;
  if (typeof d.reference !== "string" || !UUID.test(d.reference)) return null;
  if (typeof d.payment_id !== "string" || !d.payment_id || d.payment_id.length > 200) return null;
  if (typeof d.amount !== "number" || !Number.isInteger(d.amount) || d.amount < 0) return null;
  if (typeof d.currency !== "string") return null;
  return {
    id: o.id,
    type: o.type,
    data: {
      payment_id: d.payment_id,
      reference: d.reference.toLowerCase(),
      amount: d.amount,
      currency: d.currency.toUpperCase(),
      method: typeof d.method === "string" ? d.method.slice(0, 40) : undefined,
      paid_at: typeof d.paid_at === "string" && !Number.isNaN(Date.parse(d.paid_at)) ? d.paid_at : undefined,
      payment_method: parsePm(d.payment_method),
      failure_reason: typeof d.failure_reason === "string" ? d.failure_reason.slice(0, 200) : undefined,
    },
  };
}

function parsePm(v: unknown): { id: string; type: string; label: string | null } | undefined {
  const o = v as Record<string, unknown> | null | undefined;
  if (!o || typeof o.id !== "string" || !o.id || o.id.length > 200 || typeof o.type !== "string") return undefined;
  return { id: o.id, type: o.type.slice(0, 20), label: typeof o.label === "string" ? o.label.slice(0, 60) : null };
}
