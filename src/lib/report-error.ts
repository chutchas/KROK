"use client";
// ส่ง error ฝั่ง browser ไปบันทึก (/api/client-error) — ต่อหน้าไม่เกิน 10 ครั้ง, error เดิมส่งครั้งเดียว
const sent = new Set<string>();

export function reportClientError(err: unknown, kind: string): void {
  try {
    if (sent.size >= 10) return;
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err ?? "unknown"));
    // error ที่มาจาก server (มี digest) ถูกบันทึกฝั่ง server แล้ว — ไม่ส่งซ้ำ
    if ((e as Error & { digest?: string }).digest) return;
    const key = `${kind}|${e.message}`;
    if (sent.has(key)) return;
    sent.add(key);
    const body = JSON.stringify({
      kind,
      message: e.message.slice(0, 1000),
      stack: (e.stack || "").slice(0, 4000),
      digest: (e as Error & { digest?: string }).digest,
      path: location.pathname, // ไม่ส่ง query string
    });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
    else void fetch("/api/client-error", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
  } catch {
    /* ห้ามทำให้หน้าพังเพิ่ม */
  }
}
