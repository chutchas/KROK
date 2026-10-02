import "server-only";
// ============================================================
// KROK · cron: แจ้งเจ้าของบัญชีเมื่อโควตา (รวมทุก workspace) ใช้ถึง 80% / 100%
// แจ้งครั้งเดียวต่อโควตา/ระดับ/เดือน (quota_alerts) · ยังไม่รัน 0048 = ข้าม
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { getQuotaSnapshot, currentPeriod } from "@/lib/quota";
import { quotaWarnings } from "@/lib/quota-warn";
import { fmtLimit } from "@/lib/plans";
import { notifyOwner } from "@/lib/billing-renew";

export async function sendQuotaAlerts(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin.rpc("billing_owner_tenants");
  if (error || !Array.isArray(data)) return 0;
  const period = currentPeriod();
  let sent = 0;
  for (const row of data as { owner: string; tenant: string }[]) {
    let warnings;
    try { warnings = quotaWarnings(await getQuotaSnapshot(row.tenant)); } catch { continue; }
    for (const w of warnings) {
      const { data: ins, error: insErr } = await admin.from("quota_alerts")
        .upsert({ user_id: row.owner, metric: w.metric, level: w.level, period }, { onConflict: "user_id,metric,level,period", ignoreDuplicates: true })
        .select("user_id");
      if (insErr || !ins?.length) continue; // แจ้งไปแล้วเดือนนี้
      const usage = `${w.used.toLocaleString("en-US")}/${fmtLimit(w.max)}${w.unit ? ` ${w.unit}` : ""}`;
      await notifyOwner(admin, row.owner,
        w.level === 100 ? `โควตาเต็ม: ${w.label}` : `โควตาใกล้เต็ม: ${w.label} ${w.pct}%`,
        w.level === 100
          ? `ใช้ไป ${usage} (รวมทุก workspace ของบัญชี) — งานที่ใช้โควตานี้จะทำไม่ได้จนกว่าจะอัปเกรดหรือขึ้นรอบใหม่`
          : `ใช้ไป ${usage} (รวมทุก workspace ของบัญชี) — อัปเกรดแพ็กเกจก่อนเต็มเพื่อไม่ให้งานสะดุด`);
      sent++;
    }
  }
  return sent;
}
