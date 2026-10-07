// ============================================================
// ประเภทแจ้งเตือนเด้ง (Web Push) ที่ผู้ใช้เลือกปิดได้ — จัดกลุ่มจาก notifications.type
// ============================================================

export const PUSH_GROUPS = ["approval", "case", "schedule", "fail", "form"] as const;
export type PushGroup = (typeof PUSH_GROUPS)[number];

const MAP: Record<string, PushGroup> = {
  approval_request: "approval", approved: "approval", rejected: "approval",
  case_assigned: "case", case_returned: "case", case_done: "case",
  schedule_start: "schedule", schedule_overdue: "schedule",
  fail_alert: "fail",
  new_form: "form",
};

/** กลุ่มของประเภทแจ้งเตือน (ไม่รู้จัก = null → ส่งเสมอ) */
export const pushGroupOf = (type: string): PushGroup | null => MAP[type] ?? null;

export const cleanOffGroups = (v: unknown): PushGroup[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is PushGroup => (PUSH_GROUPS as readonly string[]).includes(x as string)))] : [];

/** VAPID public key (base64url) → Uint8Array สำหรับ pushManager.subscribe */
export function urlB64ToBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary");
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** endpoint ของบริการ push จริงเท่านั้น (กันให้ server ยิงไปเว็บอื่น) — Chrome/Edge(FCM) · Firefox · Edge/Windows · Safari/iOS */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /^web\.push\.apple\.com$/, /(^|\.)push\.apple\.com$/];
export function isPushEndpoint(u: unknown): u is string {
  if (typeof u !== "string" || u.length < 20 || u.length > 1000) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}
/** เครื่องที่เปิดแจ้งเตือนได้สูงสุดต่อคน */
export const MAX_PUSH_DEVICES = 10;
/** ลิงก์ในแจ้งเตือน: path ภายในเท่านั้น (ไม่รับ "//host" หรือ "/\\host") */
export const safePushLink = (link: unknown, fallback = "/dashboard") =>
  typeof link === "string" && /^\/(?![/\\])[^\s]*$/.test(link) ? link : fallback;
