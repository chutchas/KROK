// ============================================================
// KROK · เตือนโควตาใกล้เต็ม (pure — ใช้ทั้งแบนเนอร์บนแดชบอร์ดและ cron แจ้งเตือน)
// ============================================================
import { UNLIMITED, type Plan } from "./plans";
import { AI_PURPOSES, PURPOSE_LABELS, type AiPurpose } from "./ai-purpose";

export interface UsageLike {
  plan: Plan;
  formsUsed: number;
  membersUsed: number;
  submissionsMonth: number;
  storageBytes: number;
  aiByPurpose: Record<AiPurpose, number>;
}

export interface QuotaWarning {
  /** รหัสโควตา (ใช้กันแจ้งซ้ำ) */
  metric: string;
  label: string;
  used: number;
  max: number;
  pct: number;
  /** 80 = ใกล้เต็ม · 100 = เต็มแล้ว */
  level: 80 | 100;
  unit?: string;
}

export function quotaWarnings(u: UsageLike, threshold = 80): QuotaWarning[] {
  const items: { metric: string; label: string; used: number; max: number; unit?: string }[] = [
    { metric: "submissions", label: "ส่งฟอร์มเดือนนี้", used: u.submissionsMonth, max: u.plan.maxSubmissionsMonth },
    { metric: "storage", label: "พื้นที่ไฟล์", used: Math.round(u.storageBytes / 1048576), max: u.plan.storageMb, unit: "MB" },
    { metric: "forms", label: "จำนวนฟอร์ม", used: u.formsUsed, max: u.plan.maxForms },
    { metric: "members", label: "จำนวนผู้ใช้", used: u.membersUsed, max: u.plan.maxMembers },
    ...AI_PURPOSES.map((k) => ({ metric: `ai_${k}`, label: `AI: ${PURPOSE_LABELS[k]}`, used: u.aiByPurpose[k] ?? 0, max: u.plan.aiCredits[k] ?? 0 })),
  ];
  const out: QuotaWarning[] = [];
  for (const it of items) {
    if (it.max <= 0 || it.max >= UNLIMITED) continue;
    const pct = Math.round((it.used / it.max) * 100);
    if (pct < threshold) continue;
    out.push({ ...it, pct, level: pct >= 100 ? 100 : 80 });
  }
  return out.sort((a, b) => b.pct - a.pct);
}
