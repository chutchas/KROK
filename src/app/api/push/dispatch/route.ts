import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { checkDispatchSecret, pushNotification } from "@/lib/push-server";

// ============================================================
// เรียกจาก DB (trigger บน notifications ผ่าน pg_net · 0067) — ส่ง Web Push ของแจ้งเตือน 1 แถว
// ยืนยันด้วย x-push-secret (HMAC ของ VAPID private key) · ไม่มี session
// ============================================================
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!checkDispatchSecret(req.headers.get("x-push-secret"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "no service role" }, { status: 503 });
  let id = "";
  try { id = String(((await req.json()) as { id?: unknown }).id || ""); } catch { /* ignore */ }
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const r = await pushNotification(admin, id);
  return NextResponse.json({ ok: true, ...r });
}
