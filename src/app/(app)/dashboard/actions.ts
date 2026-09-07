"use server";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import {
  WIDGET_FORMATS,
  WIDGET_METRICS,
  calcMetric,
  trendDays,
  type DashWidget,
  type WidgetFormat,
  type WidgetMetric,
  type WidgetRange,
  type MetricRow,
} from "@/lib/dashboard-meta";

const RANGES: WidgetRange[] = ["today", "7d", "30d", "month", "all"];

// ตรวจ/ล้าง widget config ก่อนเก็บ (กันข้อมูลเพี้ยน)
function clean(raw: unknown): DashWidget[] {
  if (!Array.isArray(raw)) return [];
  const out: DashWidget[] = [];
  for (const w of raw.slice(0, 30)) {
    if (!w || typeof w !== "object") continue;
    const o = w as Record<string, unknown>;
    const format = o.format as WidgetFormat;
    const metric = o.metric as WidgetMetric;
    const range = o.range as WidgetRange;
    if (!WIDGET_FORMATS.includes(format)) continue;
    if (!WIDGET_METRICS.includes(metric)) continue;
    if (!RANGES.includes(range)) continue;
    out.push({
      id: typeof o.id === "string" ? o.id.slice(0, 40) : Math.random().toString(36).slice(2),
      format,
      metric,
      range,
      formId: typeof o.formId === "string" ? o.formId.slice(0, 64) : "all",
    });
  }
  return out;
}

export async function saveDashboardLayout(widgets: unknown): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.from("dashboard_layouts").upsert(
    {
      user_id: session.userId,
      tenant_id: session.tenantId,
      widgets: clean(widgets),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,tenant_id" }
  );
  if (error) return { error: error.message };
  return { ok: true };
}

// ================= คำนวณ widget ฝั่ง server (สเกลได้ ไม่จำกัด 90 วัน) =================
const CAP = 50000; // เพดานแถวต่อการคำนวณหนึ่ง widget

type SRow = MetricRow & { form_id: string | null; form_title: string; form_icon: string; submitted_at: string };

export type WidgetResult =
  | { kind: "stat"; value: number; pass?: number; fail?: number }
  | { kind: "trend"; total: number; series: { key: string; v: number }[] }
  | { kind: "ranking"; items: { title: string; icon: string; v: number }[] }
  | { error: string };

function rangeStartIso(range: WidgetRange, days?: number): string | null {
  const now = new Date();
  if (range === "all") return null;
  let d: Date;
  if (range === "today") { d = new Date(now); d.setHours(0, 0, 0, 0); }
  else if (range === "month") { d = new Date(now.getFullYear(), now.getMonth(), 1); }
  else { const n = days ?? (range === "7d" ? 7 : 30); d = new Date(now); d.setDate(now.getDate() - (n - 1)); d.setHours(0, 0, 0, 0); }
  return d.toISOString();
}
const dayKey = (ts: string) => new Date(ts).toLocaleDateString("sv");

export async function computeWidget(w: DashWidget): Promise<WidgetResult> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!WIDGET_FORMATS.includes(w.format) || !WIDGET_METRICS.includes(w.metric)) return { error: "bad widget" };

  const supabase = await createClient();
  const cols = "form_id, form_title, form_icon, result, approval_status, duration_s, user_name, submitted_at";

  // ranking = ทุกฟอร์มเสมอ; format อื่นกรองตาม formId
  const scoped = w.format !== "ranking" && w.formId && w.formId !== "all" ? w.formId : null;
  const days = trendDays(w.range);
  const startIso = w.format === "trend" ? rangeStartIso(w.range, days) : rangeStartIso(w.range);

  // ดึงเป็น batch จนครบ (หรือถึงเพดาน)
  const PAGE = 1000;
  const rows: SRow[] = [];
  for (let off = 0; off < CAP; off += PAGE) {
    let q = supabase.from("submissions").select(cols).order("submitted_at", { ascending: false }).range(off, off + PAGE - 1);
    if (scoped) q = q.eq("form_id", scoped);
    if (startIso) q = q.gte("submitted_at", startIso);
    const { data, error } = await q;
    if (error) return { error: error.message };
    const batch = (data || []) as unknown as SRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  if (w.format === "stat") {
    const value = calcMetric(rows, w.metric);
    if (w.metric === "passrate") {
      return { kind: "stat", value, pass: rows.filter((r) => r.result === "pass").length, fail: rows.filter((r) => r.result === "fail").length };
    }
    return { kind: "stat", value };
  }

  if (w.format === "trend") {
    const buckets: { key: string; rows: SRow[] }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0, 0, 0, 0); buckets.push({ key: d.toLocaleDateString("sv"), rows: [] }); }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const r of rows) { const i = idx.get(dayKey(r.submitted_at)); if (i != null) buckets[i].rows.push(r); }
    return {
      kind: "trend",
      total: calcMetric(rows, w.metric),
      series: buckets.map((b) => ({ key: b.key, v: calcMetric(b.rows, w.metric) })),
    };
  }

  // ranking
  const groups = new Map<string, { title: string; icon: string; rows: SRow[] }>();
  for (const r of rows) {
    const id = r.form_id || r.form_title;
    if (!groups.has(id)) groups.set(id, { title: r.form_title || "—", icon: r.form_icon || "📋", rows: [] });
    groups.get(id)!.rows.push(r);
  }
  const items = Array.from(groups.values())
    .map((g) => ({ title: g.title, icon: g.icon, v: calcMetric(g.rows, w.metric) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 8);
  return { kind: "ranking", items };
}
