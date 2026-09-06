"use server";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import {
  WIDGET_FORMATS,
  WIDGET_METRICS,
  type DashWidget,
  type WidgetFormat,
  type WidgetMetric,
  type WidgetRange,
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
