// เมทาดาทา widget ของ dashboard — ใช้ร่วมกัน client (ตัวสร้าง widget) + คำนวณค่า
// ไม่มี server-only ที่นี่

export type WidgetFormat = "stat" | "trend" | "ranking";
export type WidgetMetric = "usage" | "pending" | "passrate" | "avgtime" | "submitters";
export type WidgetRange = "today" | "7d" | "30d" | "month" | "all";

export interface DashWidget {
  id: string;
  format: WidgetFormat;
  formId: string; // "all" = ทุกฟอร์ม
  metric: WidgetMetric;
  range: WidgetRange;
}

export const WIDGET_FORMATS: WidgetFormat[] = ["stat", "trend", "ranking"];
export const WIDGET_METRICS: WidgetMetric[] = ["usage", "pending", "passrate", "avgtime", "submitters"];
// trend เป็นอนุกรมเวลา จึงรองรับเฉพาะช่วงที่เป็นเวลา
export const RANGES_BY_FORMAT: Record<WidgetFormat, WidgetRange[]> = {
  stat: ["today", "7d", "30d", "month", "all"],
  ranking: ["today", "7d", "30d", "month", "all"],
  trend: ["7d", "30d", "month"],
};

type L = { th: string; en: string };
const pick = (l: L, en: boolean) => (en ? l.en : l.th);

const FORMAT_L: Record<WidgetFormat, L> = {
  stat: { th: "ตัวเลขใหญ่", en: "Stat" },
  trend: { th: "กราฟแนวโน้ม", en: "Trend" },
  ranking: { th: "อันดับฟอร์ม", en: "Ranking" },
};
const FORMAT_HINT_L: Record<WidgetFormat, L> = {
  stat: { th: "ตัวเลขเดียวของฟอร์มที่เลือก", en: "Single number for the chosen form" },
  trend: { th: "กราฟรายวันของค่าที่เลือก", en: "Daily chart of the metric" },
  ranking: { th: "จัดอันดับทุกฟอร์มตามค่าที่เลือก", en: "Rank all forms by the metric" },
};
const METRIC_L: Record<WidgetMetric, L> = {
  usage: { th: "จำนวนการใช้งาน", en: "Submissions" },
  pending: { th: "รายการรออนุมัติ", en: "Pending approvals" },
  passrate: { th: "อัตราผ่าน", en: "Pass rate" },
  avgtime: { th: "เวลาเฉลี่ย/รายการ", en: "Avg time / entry" },
  submitters: { th: "จำนวนคนกรอก", en: "Unique submitters" },
};
const RANGE_L: Record<WidgetRange, L> = {
  today: { th: "วันนี้", en: "Today" },
  "7d": { th: "7 วัน", en: "7 days" },
  "30d": { th: "30 วัน", en: "30 days" },
  month: { th: "เดือนนี้", en: "This month" },
  all: { th: "ทั้งหมด", en: "All time" },
};

export const formatLabel = (f: WidgetFormat, en = false) => pick(FORMAT_L[f], en);
export const formatHint = (f: WidgetFormat, en = false) => pick(FORMAT_HINT_L[f], en);
export const metricLabel = (m: WidgetMetric, en = false) => pick(METRIC_L[m], en);
export const rangeLabel = (r: WidgetRange, en = false) => pick(RANGE_L[r], en);

// ---- คำนวณ metric (pure — ใช้ทั้งฝั่ง server และเทสต์) ----
export interface MetricRow {
  result: "pass" | "fail";
  approval_status?: string | null;
  duration_s: number | null;
  user_name?: string | null;
}
export function calcMetric(rows: MetricRow[], metric: WidgetMetric): number {
  if (metric === "usage") return rows.length;
  if (metric === "pending") return rows.filter((r) => r.approval_status === "pending").length;
  if (metric === "passrate") {
    const pass = rows.filter((r) => r.result === "pass").length;
    const fail = rows.filter((r) => r.result === "fail").length;
    return pass + fail ? Math.round((pass / (pass + fail)) * 100) : 0;
  }
  if (metric === "avgtime") {
    const ds = rows.map((r) => r.duration_s).filter((n): n is number => typeof n === "number");
    return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : 0;
  }
  return new Set(rows.map((r) => (r.user_name || "").trim()).filter(Boolean)).size; // submitters
}

// จำนวนวันของ trend ตามช่วง (month = ถึงวันปัจจุบันของเดือน)
export function trendDays(range: WidgetRange, now = new Date()): number {
  return range === "7d" ? 7 : range === "30d" ? 30 : now.getDate();
}

// หน่วยต่อท้ายค่า (สำหรับ stat)
export const metricUnit = (m: WidgetMetric, en = false): string => {
  if (m === "passrate") return "%";
  if (m === "avgtime") return en ? "s" : "วิ";
  if (m === "submitters") return en ? "" : "คน";
  return en ? "" : "ครั้ง";
};
