import "server-only";
import { createHash } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";

// ============================================================
// บันทึก error ลงตาราง error_events (0053) — best-effort ห้าม throw
// ตัดข้อมูลที่อาจเป็นข้อมูลส่วนบุคคล: ไม่เก็บ query string, ตัดความยาว, ไม่เก็บ header/body
// ============================================================

export type ErrorEvent = {
  source: "server" | "client";
  kind?: string;
  path?: string;
  message: string;
  stack?: string;
  digest?: string;
  userId?: string | null;
  tenantId?: string | null;
  userAgent?: string | null;
};

const clip = (s: string | null | undefined, n: number) => (s ? String(s).slice(0, n) : null);

/** path ที่ไม่มี query/hash (กัน token/อีเมลใน URL หลุดเข้าบันทึก) */
export function cleanPath(p: string | null | undefined): string | null {
  if (!p) return null;
  return clip(String(p).split(/[?#]/)[0], 300);
}

/** กลุ่ม error: ข้อความ (ตัดตัวเลข/uuid ออก) + บรรทัดแรกของ stack + path แบบไม่มี id */
export function fingerprintOf(e: Pick<ErrorEvent, "message" | "stack" | "path">): string {
  const norm = (s: string) => s.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id").replace(/\d+/g, "N");
  const frame = (e.stack || "").split("\n").find((l) => l.trim().startsWith("at ")) || "";
  return createHash("sha1").update(`${norm(e.message)}|${norm(frame.trim())}|${norm(cleanPath(e.path) || "")}`).digest("hex").slice(0, 16);
}

export async function logError(e: ErrorEvent): Promise<void> {
  try {
    const admin = getAdminClient();
    if (!admin) return;
    await admin.from("error_events").insert({
      source: e.source,
      kind: clip(e.kind, 40),
      path: cleanPath(e.path),
      message: clip(e.message, 1000) || "(no message)",
      stack: clip(e.stack, 4000),
      digest: clip(e.digest, 100),
      fingerprint: fingerprintOf(e),
      user_id: e.userId || null,
      tenant_id: e.tenantId || null,
      user_agent: clip(e.userAgent, 300),
      release: clip(process.env.VERCEL_GIT_COMMIT_SHA, 12),
    });
  } catch {
    /* ไม่มีตาราง (ยังไม่รัน 0053) / เครือข่าย — ปล่อยผ่าน */
  }
}
