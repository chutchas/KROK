// ============================================================
// คำนวณยอดขาย/ต้นทุนสำหรับหน้า Platform Admin › ยอดขายและต้นทุน (ฟังก์ชันล้วน — ทดสอบได้)
// ราคา AI ตั้งเป็น USD ต่อ 1 ล้าน token → แปลงเป็นบาทด้วยอัตราที่แอดมินตั้งเอง
// ============================================================

export interface ModelPrice {
  model: string;
  inputPerM: number;
  outputPerM: number;
}

export interface UsageRow {
  month: string; // YYYY-MM (เวลาไทย)
  purpose: string;
  provider: string;
  model: string;
  tenantId: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

/** ต้นทุน USD ของ token ชุดหนึ่ง · ไม่มีราคา = null (แสดงเตือนให้ไปตั้งราคา) */
export function tokenCostUsd(input: number, output: number, price: ModelPrice | undefined): number | null {
  if (!price) return null;
  return (input * price.inputPerM + output * price.outputPerM) / 1_000_000;
}

export interface CostBucket {
  key: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  /** มีบางแถวที่ยังไม่ได้ตั้งราคา → usd ต่ำกว่าความจริง */
  unpriced: boolean;
}

/** รวมการใช้ token ตามคีย์ที่เลือก (รุ่น / งาน / workspace / เดือน) พร้อมต้นทุน USD */
export function groupUsage(rows: UsageRow[], prices: Map<string, ModelPrice>, keyOf: (r: UsageRow) => string): CostBucket[] {
  const m = new Map<string, CostBucket>();
  for (const r of rows) {
    const k = keyOf(r);
    const b = m.get(k) ?? { key: k, calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, unpriced: false };
    b.calls += r.calls;
    b.inputTokens += r.inputTokens;
    b.outputTokens += r.outputTokens;
    const c = tokenCostUsd(r.inputTokens, r.outputTokens, prices.get(r.model));
    if (c === null) b.unpriced = true;
    else b.usd += c;
    m.set(k, b);
  }
  return [...m.values()].sort((a, b) => b.usd - a.usd || b.calls - a.calls);
}

/** รายได้ต่อเดือนของสมาชิก 1 ราย: ราคาที่ล็อกไว้ ÷ จำนวนเดือนต่อรอบ · ไม่มี = ราคาแพ็กเกจปัจจุบัน */
export function monthlyValue(listPriceThb: number, renewPrice: number | null, renewMonths: number | null): number {
  if (renewPrice != null && renewPrice > 0) return renewPrice / Math.max(1, renewMonths || 1);
  return Math.max(0, listPriceThb || 0);
}

/** สมาชิกที่ยังนับว่าจ่ายอยู่: ไม่ใช่ free และยังไม่หมดอายุเกินช่วงผ่อนผัน */
export function isActivePaid(plan: string, expiresAt: string | null, nowMs: number, graceDays = 3): boolean {
  if (!plan || plan === "free") return false;
  if (!expiresAt) return true;
  return Date.parse(expiresAt) > nowMs - graceDays * 86400_000;
}

/** เดือนปัจจุบันและย้อนหลัง (เวลาไทย) รูปแบบ YYYY-MM เรียงใหม่ → เก่า */
export function recentMonths(nowMs: number, n: number): string[] {
  const d = new Date(nowMs + 7 * 3600_000); // UTC+7
  let y = d.getUTCFullYear();
  let mo = d.getUTCMonth();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(mo + 1).padStart(2, "0")}`);
    mo--;
    if (mo < 0) { mo = 11; y--; }
  }
  return out;
}

/** ช่วงเวลาของเดือน (เวลาไทย) เป็น ISO UTC [from, to) */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 7 * 3600_000);
  const to = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - 7 * 3600_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
