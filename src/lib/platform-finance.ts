import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_PURPOSES, PURPOSE_LABELS, resolveConfig } from "@/lib/ai";
import { getEffectivePlans } from "@/lib/plans-server";
import {
  groupUsage, isActivePaid, monthlyValue, monthRange, recentMonths,
  type CostBucket, type ModelPrice, type UsageRow,
} from "@/lib/finance-calc";

// ============================================================
// ข้อมูลหน้า Platform Admin › ยอดขายและต้นทุน
// รายได้ = ใบแจ้งหนี้ที่ชำระแล้ว (ตามเดือนที่ชำระ, เวลาไทย) · MRR = สมาชิกที่ยังจ่ายอยู่ ณ ตอนนี้
// ต้นทุน AI = token จริง (0058 เป็นต้นไป) × ราคาที่ตั้งในหน้านี้ × อัตราแลกเปลี่ยน
// ============================================================

const TREND_MONTHS = 6;

export interface MonthSummary {
  month: string;
  revenueThb: number;
  invoices: number;
  aiUsd: number;
  aiThb: number;
  aiUnpriced: boolean;
  aiCalls: number;
  creditCalls: number;
  fixedThb: number;
  profitThb: number;
}

export interface FinanceReport {
  month: string;
  months: string[];
  settings: { usdThb: number; fixedMonthlyThb: number; updatedAt: string | null };
  prices: ModelPrice[];
  /** รุ่นที่ควรตั้งราคา: เคยถูกใช้ + ตั้งไว้ในหน้า AI */
  modelsToPrice: { model: string; provider: string; used: boolean; configuredFor: string[] }[];
  subs: { activePaid: number; mrrThb: number; byPlan: { plan: string; name: string; count: number; mrrThb: number }[] };
  current: MonthSummary;
  trend: MonthSummary[];
  revenueByPlan: { plan: string; name: string; count: number; amountThb: number }[];
  aiByModel: CostBucket[];
  aiByPurpose: (CostBucket & { label: string })[];
  topTenants: (CostBucket & { name: string })[];
  tokensSince: string | null;
  missing: string[];
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export async function loadFinance(admin: SupabaseClient, month: string, nowMs: number): Promise<FinanceReport> {
  const months = recentMonths(nowMs, 12);
  const trendMonths = recentMonths(nowMs, TREND_MONTHS).reverse();
  // ช่วงที่ต้องดึง: ครอบทั้งเดือนที่เลือกและกราฟ 6 เดือน
  const allMonths = [...new Set([...trendMonths, month])].sort();
  const from = monthRange(allMonths[0]).from;
  const to = monthRange(allMonths[allMonths.length - 1]).to;
  const missing: string[] = [];

  const [settingsQ, pricesQ, usageQ, firstQ, creditQ, invQ, acctQ, plans] = await Promise.all([
    admin.from("platform_cost_settings").select("usd_thb, fixed_monthly_thb, updated_at").eq("id", true).maybeSingle(),
    admin.from("platform_ai_prices").select("model, input_per_m, output_per_m"),
    admin.rpc("platform_ai_usage", { p_from: from, p_to: to }),
    admin.from("ai_token_usage").select("at").order("at", { ascending: true }).limit(1).maybeSingle(),
    admin.from("tenant_ai_usage").select("period, calls").in("period", allMonths),
    admin.from("invoices").select("amount, plan, paid_at").eq("status", "paid").gte("paid_at", from).lt("paid_at", to).limit(20000),
    admin.from("account_plans").select("plan, expires_at, renew_price, renew_months").neq("plan", "free").limit(20000),
    getEffectivePlans(),
  ]);
  if (settingsQ.error || pricesQ.error || usageQ.error) missing.push("0058_platform_ops");

  const usdThb = num(settingsQ.data?.usd_thb) || 35;
  const fixedMonthlyThb = num(settingsQ.data?.fixed_monthly_thb);
  const prices: ModelPrice[] = (pricesQ.data || []).map((p) => ({ model: p.model as string, inputPerM: num(p.input_per_m), outputPerM: num(p.output_per_m) }));
  const priceMap = new Map(prices.map((p) => [p.model, p]));

  const usage: UsageRow[] = ((usageQ.data || []) as Record<string, unknown>[]).map((r) => ({
    month: r.month as string, purpose: r.purpose as string, provider: r.provider as string, model: r.model as string,
    tenantId: (r.tenant_id as string) ?? null, calls: num(r.calls), inputTokens: num(r.input_tokens), outputTokens: num(r.output_tokens),
  }));

  const planName = (k: string) => plans[k]?.name ?? k;

  // ── สมาชิกที่ยังจ่ายอยู่ / MRR ──
  const byPlan = new Map<string, { count: number; mrr: number }>();
  for (const a of (acctQ.data || []) as Record<string, unknown>[]) {
    const plan = a.plan as string;
    if (!isActivePaid(plan, (a.expires_at as string) ?? null, nowMs)) continue;
    const v = monthlyValue(plans[plan]?.priceThb ?? 0, (a.renew_price as number) ?? null, (a.renew_months as number) ?? null);
    const b = byPlan.get(plan) ?? { count: 0, mrr: 0 };
    b.count++;
    b.mrr += v;
    byPlan.set(plan, b);
  }
  const subsByPlan = [...byPlan.entries()].map(([plan, b]) => ({ plan, name: planName(plan), count: b.count, mrrThb: Math.round(b.mrr) })).sort((a, b) => b.mrrThb - a.mrrThb);

  // ── รายได้ตามเดือนที่ชำระ (เวลาไทย) ──
  const bkkMonth = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 7);
  const invoices = ((invQ.data || []) as { amount: number; plan: string | null; paid_at: string }[]).map((i) => ({ ...i, month: bkkMonth(i.paid_at) }));
  const credits = new Map<string, number>();
  for (const c of (creditQ.data || []) as { period: string; calls: number }[]) credits.set(c.period, (credits.get(c.period) || 0) + num(c.calls));

  const summarize = (m: string): MonthSummary => {
    const inv = invoices.filter((i) => i.month === m);
    const revenueThb = inv.reduce((s, i) => s + num(i.amount), 0);
    const rows = usage.filter((u) => u.month === m);
    const [tot] = groupUsage(rows, priceMap, () => "all");
    const aiUsd = tot?.usd ?? 0;
    const aiThb = aiUsd * usdThb;
    return {
      month: m, revenueThb, invoices: inv.length, aiUsd, aiThb, aiUnpriced: !!tot?.unpriced,
      aiCalls: tot?.calls ?? 0, creditCalls: credits.get(m) || 0, fixedThb: fixedMonthlyThb,
      profitThb: revenueThb - aiThb - fixedMonthlyThb,
    };
  };

  const monthRows = usage.filter((u) => u.month === month);
  const revByPlan = new Map<string, { count: number; amount: number }>();
  for (const i of invoices.filter((x) => x.month === month)) {
    const k = i.plan || "-";
    const b = revByPlan.get(k) ?? { count: 0, amount: 0 };
    b.count++;
    b.amount += num(i.amount);
    revByPlan.set(k, b);
  }

  const topRaw = groupUsage(monthRows, priceMap, (r) => r.tenantId || "-").slice(0, 10);
  const tenantIds = topRaw.map((t) => t.key).filter((k) => k !== "-");
  const names = new Map<string, string>();
  if (tenantIds.length) {
    const { data } = await admin.from("tenants").select("id, name").in("id", tenantIds);
    for (const t of data || []) names.set(t.id as string, t.name as string);
  }

  // รุ่นที่ควรตั้งราคา
  const models = new Map<string, { model: string; provider: string; used: boolean; configuredFor: string[] }>();
  for (const u of usage) {
    const e = models.get(u.model) ?? { model: u.model, provider: u.provider, used: true, configuredFor: [] };
    e.used = true;
    models.set(u.model, e);
  }
  for (const p of AI_PURPOSES) {
    try {
      const cfg = await resolveConfig(p);
      if (!cfg.model) continue;
      const e = models.get(cfg.model) ?? { model: cfg.model, provider: cfg.provider, used: false, configuredFor: [] };
      e.configuredFor.push(PURPOSE_LABELS[p]);
      models.set(cfg.model, e);
    } catch {
      /* ไม่มีค่าตั้ง = ข้าม */
    }
  }
  for (const p of prices) if (!models.has(p.model)) models.set(p.model, { model: p.model, provider: "", used: false, configuredFor: [] });

  return {
    month, months,
    settings: { usdThb, fixedMonthlyThb, updatedAt: (settingsQ.data?.updated_at as string) ?? null },
    prices,
    modelsToPrice: [...models.values()].sort((a, b) => Number(b.used) - Number(a.used) || a.model.localeCompare(b.model)),
    subs: { activePaid: subsByPlan.reduce((s, p) => s + p.count, 0), mrrThb: subsByPlan.reduce((s, p) => s + p.mrrThb, 0), byPlan: subsByPlan },
    current: summarize(month),
    trend: trendMonths.map(summarize),
    revenueByPlan: [...revByPlan.entries()].map(([plan, b]) => ({ plan, name: plan === "-" ? "อื่น ๆ" : planName(plan), count: b.count, amountThb: b.amount })).sort((a, b) => b.amountThb - a.amountThb),
    aiByModel: groupUsage(monthRows, priceMap, (r) => r.model),
    aiByPurpose: groupUsage(monthRows, priceMap, (r) => r.purpose).map((b) => ({ ...b, label: (PURPOSE_LABELS as Record<string, string>)[b.key] ?? b.key })),
    topTenants: topRaw.map((t) => ({ ...t, name: t.key === "-" ? "(ไม่ระบุ workspace / ทดสอบระบบ)" : names.get(t.key) ?? "(workspace ถูกลบ)" })),
    tokensSince: (firstQ.data?.at as string) ?? null,
    missing,
  };
}
