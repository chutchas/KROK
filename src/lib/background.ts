import "server-only";
import { after } from "next/server";

/**
 * รันงานเบื้องหลังหลังตอบผู้ใช้แล้ว (webhook / LINE / อีเมล) — ไม่ให้การยิงออกภายนอกที่ช้าหรือ retry ถ่วง request
 * อยู่นอก request (เช่น เทสต์/สคริปต์) → after() ใช้ไม่ได้ ก็รันทันทีแบบไม่รอ
 * error ถูกกลืนเสมอ (best-effort)
 */
export function runLater(job: () => Promise<unknown>): void {
  const safe = async () => { try { await job(); } catch { /* best-effort */ } };
  try {
    after(safe);
  } catch {
    void safe();
  }
}
