import QuotaBanner from "@/components/QuotaBanner";
import { getQuotaSnapshot } from "@/lib/quota";
import { quotaWarnings } from "@/lib/quota-warn";
import type { KrokSession } from "@/lib/session";

/**
 * เตือนโควตาใกล้เต็ม/เต็ม ในหน้าที่กำลังจะสร้างของ (ไม่ใช่แค่แดชบอร์ด) — server component
 * metrics = โควตาที่เกี่ยวกับหน้านี้ (เช่น ["forms", "ai_form_gen"]) · onlyFull = เตือนเฉพาะที่เต็มแล้ว
 * อ่านโควตาไม่ได้ = ไม่แสดงอะไร (ไม่ทำให้หน้าพัง)
 */
export default async function QuotaHint({ session, metrics, onlyFull = false }: { session: KrokSession; metrics: string[]; onlyFull?: boolean }) {
  let warnings: ReturnType<typeof quotaWarnings> = [];
  let canUpgrade = false;
  try {
    const snap = await getQuotaSnapshot(session.tenantId);
    warnings = quotaWarnings(snap).filter((w) => metrics.includes(w.metric) && (!onlyFull || w.level === 100));
    canUpgrade = snap.ownerId ? snap.ownerId === session.userId : session.role === "owner";
  } catch {
    return null;
  }
  if (!warnings.length) return null;
  return <QuotaBanner warnings={warnings} canUpgrade={canUpgrade} />;
}
