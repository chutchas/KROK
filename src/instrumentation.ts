// error ฝั่ง server (Server Components / Route Handlers / Server Actions / Proxy) → ตาราง error_events
// เฉพาะ runtime nodejs (proxy ที่รันแบบ edge ข้าม — ไม่มี node:crypto)
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: { [key: string]: string | string[] } },
  context: { routeType: string }
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logError } = await import("@/lib/error-log");
  const e = err instanceof Error ? err : new Error(String(err));
  const ua = request.headers["user-agent"];
  await logError({
    source: "server",
    kind: context.routeType,
    path: request.path,
    message: e.message,
    stack: e.stack,
    digest: typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined,
    userAgent: Array.isArray(ua) ? ua[0] : ua,
  });
}
