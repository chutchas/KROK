import { NextResponse } from "next/server";
import { logError } from "@/lib/error-log";
import { rateLimited } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// error จาก browser (error boundary / window.onerror) — ไม่ต้องล็อกอิน (ฟอร์มสาธารณะก็ส่งได้) · จำกัด 30 ครั้ง/นาที/IP
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > 20_000) return new NextResponse(null, { status: 413 });
  if (await rateLimited(`clienterr:${clientIp(req)}`, 30, 60)) return new NextResponse(null, { status: 429 });
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return new NextResponse(null, { status: 400 }); }
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  let userId: string | null = null;
  try {
    const { data } = await (await createClient()).auth.getClaims();
    userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  } catch { /* ไม่ล็อกอิน */ }
  const message = str(b.message);
  if (!message) return new NextResponse(null, { status: 400 });
  await logError({
    source: "client",
    kind: str(b.kind),
    path: str(b.path),
    message,
    stack: str(b.stack),
    digest: str(b.digest),
    userId,
    userAgent: req.headers.get("user-agent"),
  });
  return new NextResponse(null, { status: 204 });
}
