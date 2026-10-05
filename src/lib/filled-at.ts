// เวลาที่กรอกจริงจากเครื่องผู้ใช้ (คิวออฟไลน์) — รับเฉพาะช่วงที่สมเหตุสมผล
export const FILLED_AT_MAX_AGE_MS = 7 * 86400_000;
const FUTURE_SLACK_MS = 2 * 60_000; // นาฬิกาเครื่องเร็วกว่าเล็กน้อย

/** ms จากเครื่อง → ISO ที่จะบันทึก (null = ใช้เวลาที่ server ได้รับแทน) */
export function clampFilledAt(clientMs: unknown, nowMs: number): string | null {
  const v = typeof clientMs === "number" ? clientMs : Number(clientMs);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v > nowMs + FUTURE_SLACK_MS || v < nowMs - FILLED_AT_MAX_AGE_MS) return null;
  return new Date(Math.min(v, nowMs)).toISOString();
}

/** กรอกจริงห่างจากเวลาที่ระบบได้รับเกินนี้ → แสดงให้เห็นว่าเป็นใบที่ sync ทีหลัง */
export const SYNC_GAP_MS = 2 * 60_000;

export function isLateSync(filledAt: string | null | undefined, submittedAt: string | null | undefined): boolean {
  if (!filledAt || !submittedAt) return false;
  return Date.parse(submittedAt) - Date.parse(filledAt) > SYNC_GAP_MS;
}
