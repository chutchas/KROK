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
