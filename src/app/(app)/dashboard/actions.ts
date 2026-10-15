"use server";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { getSession, hasMenu } from "@/lib/session";
import {
  WIDGET_FORMATS,
  WIDGET_METRICS,
  METRICS_BY_FORMAT,
  CLOSEOUT_METRICS,
  calcMetric,
  calcMetricAgg,
  trendDays,
  type MetricAgg,
  type DashWidget,
  type WidgetFormat,
  type WidgetMetric,
  type WidgetRange,
  type MetricRow,
} from "@/lib/dashboard-meta";

import { loadCompliance, complianceByTeam, type ComplianceRow } from "@/lib/schedule-server";
import type { OpenItem } from "@/lib/areas";

const RANGES: WidgetRange[] = ["today", "7d", "14d", "30d", "month", "all"];

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
    if (METRICS_BY_FORMAT[format].length && !METRICS_BY_FORMAT[format].includes(metric)) continue;
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
  if (error) return { error: await sm(dbError(error)) };
  return { ok: true };
}

/** Dashboard ของ workspace — เจ้าของ/แอดมิน เท่านั้น (RLS ตรวจซ้ำ · 0073) */
export async function saveWorkspaceDashboard(widgets: unknown): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (session.role !== "owner" && session.role !== "admin") return { error: await sm("เฉพาะ เจ้าของ/แอดมิน เท่านั้น") };
  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_dashboards")
    .upsert({ tenant_id: session.tenantId, widgets: clean(widgets) }, { onConflict: "tenant_id" });
  if (error) {
    const m = error.message || "";
    if (/workspace_dashboards/.test(m) && /does not exist|schema cache|not find/i.test(m)) return { error: await sm("ยังไม่ได้รัน migration 0073") };
    return { error: await sm(dbError(error)) };
  }
  return { ok: true };
}

// ================= คำนวณ widget ฝั่ง server (สเกลได้ ไม่จำกัด 90 วัน) =================
const CAP = 50000; // เพดานแถวต่อการคำนวณหนึ่ง widget

type SRow = MetricRow & { form_id: string | null; form_title: string; form_icon: string; submitted_at: string };

export type WidgetResult =
  | { kind: "stat"; value: number; pass?: number; fail?: number; empty?: boolean }
  | { kind: "trend"; total: number; series: { key: string; v: number }[] }
  | { kind: "ranking"; items: { title: string; icon: string; v: number }[] }
  | { kind: "area"; items: OpenItem[] }
  | { kind: "openlist"; total: number; items: OpenFailItem[] }
  | { kind: "topfails"; total: number; items: { label: string; v: number }[] }
  | { error: string };

export interface OpenFailItem { id: string; docNo: string | null; title: string; icon: string; who: string; fail: string; at: string }

function rangeStartIso(range: WidgetRange, days?: number): string | null {
  const now = new Date();
  if (range === "all") return null;
  let d: Date;
  if (range === "today") { d = new Date(now); d.setHours(0, 0, 0, 0); }
  else if (range === "month") { d = new Date(now.getFullYear(), now.getMonth(), 1); }
  else { const n = days ?? (range === "7d" ? 7 : range === "14d" ? 14 : 30); d = new Date(now); d.setDate(now.getDate() - (n - 1)); d.setHours(0, 0, 0, 0); }
  return d.toISOString();
}
const dayKey = (ts: string) => new Date(ts).toLocaleDateString("sv");

type AggRow = MetricAgg & { k: string | null; title: string | null; icon: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO: MetricAgg = { n: 0, pending: 0, pass: 0, fail: 0, dur_sum: 0, dur_n: 0, submitters: 0 };
const num = (r: Record<string, unknown>): AggRow => ({
  k: (r.k as string) ?? null, title: (r.title as string) ?? null, icon: (r.icon as string) ?? null,
  n: Number(r.n) || 0, pending: Number(r.pending) || 0, pass: Number(r.pass) || 0, fail: Number(r.fail) || 0,
  dur_sum: Number(r.dur_sum) || 0, dur_n: Number(r.dur_n) || 0, submitters: Number(r.submitters) || 0,
});

/**
 * fast path: ให้ฐานข้อมูลนับ (RPC dashboard_metrics, migration 0037) — คืน null ถ้ายังไม่มี RPC → ใช้วิธีเดิม
 */
async function computeWidgetSql(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, w: DashWidget, scoped: string | null): Promise<WidgetResult | null> {
  // RPC (0037) รู้จักแค่ today/7d/30d/month/all — ช่วงอื่น (14d) ใช้วิธีนับในแอป
  if (!["today", "7d", "30d", "month", "all"].includes(w.range)) return null;
  const call = async (group: "none" | "form" | "day") => {
    const { data, error } = await supabase.rpc("dashboard_metrics", {
      p_tenant: tenantId, p_form: scoped, p_range: w.range, p_group: group, p_tz: "Asia/Bangkok",
    });
    if (error) throw error;
    return ((data || []) as Record<string, unknown>[]).map(num);
  };
  try {
    if (w.format === "stat") {
      const a = (await call("none"))[0] ?? ZERO;
      const value = calcMetricAgg(a, w.metric);
      return w.metric === "passrate" ? { kind: "stat", value, pass: a.pass, fail: a.fail } : { kind: "stat", value };
    }
    if (w.format === "trend") {
      const [tot, days] = await Promise.all([call("none"), call("day")]);
      return {
        kind: "trend",
        total: calcMetricAgg(tot[0] ?? ZERO, w.metric),
        series: days.map((d) => ({ key: d.k || "", v: calcMetricAgg(d, w.metric) })),
      };
    }
    const groups = await call("form");
    const items = groups
      .map((g) => ({ title: g.title || "—", icon: g.icon || "📋", v: calcMetricAgg(g, w.metric) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 8);
    return { kind: "ranking", items };
  } catch (e) {
    const m = (e as { message?: string })?.message || "";
    if (/dashboard_metrics/.test(m) && /does not exist|schema cache|not find/i.test(m)) return null; // ยังไม่ได้รัน 0037
    return { error: m || "คำนวณไม่สำเร็จ" };
  }
}

/**
 * คำนวณหลาย widget ในคำขอเดียว — server action ถูกเรียกเรียงทีละตัวจากฝั่ง client
 * (widget 6 ตัว = 6 รอบ round-trip ต่อกัน) จึงรวมเป็นก้อนเดียวแล้วคำนวณขนานกันฝั่ง server
 */
export async function computeWidgets(ws: DashWidget[]): Promise<WidgetResult[]> {
  if (!Array.isArray(ws)) return [];
  return Promise.all(ws.slice(0, 30).map((w) => computeWidget(w).catch(() => ({ error: "คำนวณไม่สำเร็จ" }) as WidgetResult)));
}

export async function computeWidget(w: DashWidget): Promise<WidgetResult> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!(await hasMenu(session, "dashboard"))) return { error: await sm("ไม่มีสิทธิ์ใช้แดชบอร์ด") };
  if (!WIDGET_FORMATS.includes(w.format) || !WIDGET_METRICS.includes(w.metric)) return { error: "bad widget" };
  if (!RANGES.includes(w.range)) return { error: "bad widget" };
  if (METRICS_BY_FORMAT[w.format].length && !METRICS_BY_FORMAT[w.format].includes(w.metric)) return { error: "bad widget" };

  const supabase = await createClient();
  if (w.format === "area") return computeAreaWidget(supabase, session.tenantId, w.formId);
  if (w.format === "openlist") return computeOpenList(supabase, session.tenantId, w.formId);
  if (w.format === "topfails") return computeTopFails(supabase, session.tenantId, w);
  if (CLOSEOUT_METRICS.includes(w.metric)) return computeCloseout(supabase, session.tenantId, w);
  {
    const scopedFast = w.format !== "ranking" && w.formId && w.formId !== "all" && UUID.test(w.formId) ? w.formId : null;
    if (w.format === "ranking" || !w.formId || w.formId === "all" || scopedFast) {
      const fast = await computeWidgetSql(supabase, session.tenantId, w, scopedFast);
      if (fast) return fast;
    }
  }

  // ---- วิธีเดิม (ก่อนรัน migration 0037): ดึงแถวมานับในแอป ----
  const cols = "form_id, form_title, form_icon, result, approval_status, duration_s, user_name, submitted_at";

  // ranking = ทุกฟอร์มเสมอ; format อื่นกรองตาม formId
  const scoped = w.format !== "ranking" && w.formId && w.formId !== "all" ? w.formId : null;
  const days = trendDays(w.range);
  const startIso = w.format === "trend" ? rangeStartIso(w.range, days) : rangeStartIso(w.range);

  // ดึงเป็น batch จนครบ (หรือถึงเพดาน)
  const PAGE = 1000;
  const rows: SRow[] = [];
  for (let off = 0; off < CAP; off += PAGE) {
    // เฉพาะ workspace ที่เปิดอยู่ — RLS อย่างเดียวจะรวมทุก workspace ที่ผู้ใช้เป็นสมาชิก
    let q = supabase.from("submissions").select(cols).eq("tenant_id", session.tenantId).order("submitted_at", { ascending: false }).range(off, off + PAGE - 1);
    if (scoped) q = q.eq("form_id", scoped);
    if (startIso) q = q.gte("submitted_at", startIso);
    const { data, error } = await q;
    if (error) return { error: await sm(dbError(error)) };
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

// ---------- ปิดเรื่องใบไม่ผ่าน (0080) ----------
type Sb = Awaited<ReturnType<typeof createClient>>;
const CLOSE_CAP = 5000;
const formScope = (formId: string) => (formId && formId !== "all" && UUID.test(formId) ? formId : null);
async function closeoutErr(m: string): Promise<{ error: string }> {
  if (/fail_closed_at|deleted_at/.test(m) && /does not exist|schema cache|not find|column/i.test(m)) return { error: await sm("ยังไม่ได้รัน migration 0080") };
  return { error: m || (await sm("คำนวณไม่สำเร็จ")) };
}
const openFails = (supabase: Sb, tenantId: string, cols: string, opts?: { count?: "exact"; head?: boolean }) =>
  supabase.from("submissions").select(cols, opts).eq("tenant_id", tenantId).eq("result", "fail").is("fail_closed_at", null).is("deleted_at", null);

async function computeCloseout(supabase: Sb, tenantId: string, w: DashWidget): Promise<WidgetResult> {
  const start = rangeStartIso(w.range);
  if (w.metric === "openfail" && w.format === "ranking") {
    let q = openFails(supabase, tenantId, "form_id, form_title, form_icon").limit(CLOSE_CAP);
    if (start) q = q.gte("submitted_at", start);
    const { data, error } = await q;
    if (error) return closeoutErr(error.message);
    const g = new Map<string, { title: string; icon: string; v: number }>();
    for (const r of (data || []) as unknown as { form_id: string | null; form_title: string; form_icon: string }[]) {
      const k = r.form_id || r.form_title;
      const e = g.get(k) ?? { title: r.form_title || "—", icon: r.form_icon || "📋", v: 0 };
      e.v++;
      g.set(k, e);
    }
    return { kind: "ranking", items: [...g.values()].sort((a, b) => b.v - a.v).slice(0, 8) };
  }
  const scoped = formScope(w.formId);
  if (w.metric === "openfail") {
    let q = openFails(supabase, tenantId, "id", { count: "exact", head: true });
    if (scoped) q = q.eq("form_id", scoped);
    if (start) q = q.gte("submitted_at", start);
    const { count, error } = await q;
    if (error) return closeoutErr(error.message);
    return { kind: "stat", value: count ?? 0 };
  }
  // closetime: มัธยฐานวันจากส่งถึงปิดเรื่อง ของใบที่ปิดในช่วงนี้
  let q = supabase.from("submissions").select("submitted_at, fail_closed_at").eq("tenant_id", tenantId).eq("result", "fail")
    .not("fail_closed_at", "is", null).is("deleted_at", null).order("fail_closed_at", { ascending: false }).limit(CLOSE_CAP);
  if (scoped) q = q.eq("form_id", scoped);
  if (start) q = q.gte("fail_closed_at", start);
  const { data, error } = await q;
  if (error) return closeoutErr(error.message);
  const ds = ((data || []) as { submitted_at: string; fail_closed_at: string }[])
    .map((r) => (Date.parse(r.fail_closed_at) - Date.parse(r.submitted_at)) / 86_400_000)
    .filter((d) => Number.isFinite(d) && d >= 0)
    .sort((a, b) => a - b);
  if (!ds.length) return { kind: "stat", value: 0, empty: true };
  const mid = Math.floor(ds.length / 2);
  const med = ds.length % 2 ? ds[mid] : (ds[mid - 1] + ds[mid]) / 2;
  return { kind: "stat", value: Math.round(med * 10) / 10 };
}

async function computeOpenList(supabase: Sb, tenantId: string, formId: string): Promise<WidgetResult> {
  let q = openFails(supabase, tenantId, "id, doc_no, form_title, form_icon, user_name, submitted_at, fails", { count: "exact" })
    .order("submitted_at", { ascending: true }).limit(6);
  const scoped = formScope(formId);
  if (scoped) q = q.eq("form_id", scoped);
  const { data, count, error } = await q;
  if (error) return closeoutErr(error.message);
  const items = ((data || []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    docNo: (r.doc_no as string) || null,
    title: (r.form_title as string) || "—",
    icon: (r.form_icon as string) || "📋",
    who: (r.user_name as string) || "",
    fail: Array.isArray(r.fails) && typeof r.fails[0] === "string" ? (r.fails[0] as string) : "",
    at: r.submitted_at as string,
  }));
  return { kind: "openlist", total: count ?? items.length, items };
}

async function computeTopFails(supabase: Sb, tenantId: string, w: DashWidget): Promise<WidgetResult> {
  const start = rangeStartIso(w.range);
  const scoped = formScope(w.formId);
  const PAGE = 1000;
  const counts = new Map<string, number>();
  let total = 0;
  for (let off = 0; off < CLOSE_CAP; off += PAGE) {
    let q = supabase.from("submissions").select("fails").eq("tenant_id", tenantId).eq("result", "fail")
      .is("deleted_at", null).order("submitted_at", { ascending: false }).range(off, off + PAGE - 1);
    if (scoped) q = q.eq("form_id", scoped);
    if (start) q = q.gte("submitted_at", start);
    const { data, error } = await q;
    if (error) return closeoutErr(error.message);
    const batch = (data || []) as { fails: unknown }[];
    total += batch.length;
    for (const r of batch) {
      if (!Array.isArray(r.fails)) continue;
      // ข้อเดียวกันในใบเดียวนับครั้งเดียว
      for (const l of new Set(r.fails.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))) {
        counts.set(l, (counts.get(l) ?? 0) + 1);
      }
    }
    if (batch.length < PAGE) break;
  }
  const items = [...counts.entries()].map(([label, v]) => ({ label, v })).sort((a, b) => b.v - a.v).slice(0, 6);
  return { kind: "topfails", total, items };
}

// ---------- ใบที่ยังไม่จบตามพื้นที่ (0072) ----------
async function computeAreaWidget(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, areaId: string): Promise<WidgetResult> {
  const { data, error } = await supabase.rpc("area_open_items", { p_tenant: tenantId, p_area: UUID.test(areaId) ? areaId : null });
  if (error) {
    const m = error.message || "";
    if (/area_open_items/.test(m) && /does not exist|schema cache|not find/i.test(m)) return { error: await sm("ยังไม่ได้รัน migration 0072") };
    return { error: await sm(dbError(error)) };
  }
  return { kind: "area", items: (data || []) as OpenItem[] };
}

// ---------- รอบตรวจตามตาราง: ความครบถ้วน (0064) ----------
export interface ComplianceResult {
  days: number;
  forms: ComplianceRow[];
  teams: ReturnType<typeof complianceByTeam>;
}

export async function loadScheduleCompliance(days: number): Promise<ComplianceResult | null | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!(await hasMenu(session, "dashboard"))) return { error: await sm("ไม่มีสิทธิ์ใช้แดชบอร์ด") };
  const d = days === 30 ? 30 : days === 90 ? 90 : 7;
  const supabase = await createClient();
  const [rows, teamsQ] = await Promise.all([
    loadCompliance(supabase, session.tenantId, d),
    supabase.from("teams").select("id, name").eq("tenant_id", session.tenantId),
  ]);
  if (!rows) return null;
  const names = new Map(((teamsQ.data || []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));
  return { days: d, forms: rows, teams: complianceByTeam(rows, names) };
}
