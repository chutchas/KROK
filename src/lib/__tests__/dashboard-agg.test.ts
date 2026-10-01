import { describe, it, expect } from "vitest";
import { aggOf, calcMetric, calcMetricAgg, WIDGET_METRICS, type MetricRow } from "@/lib/dashboard-meta";

// สุ่มแถวแบบกำหนด seed — ผลจากผลรวม (ที่ SQL คืน) ต้องเท่ากับสูตรเดิมที่นับจากแถวดิบทุก metric
function rows(seed: number, n: number): MetricRow[] {
  let x = seed;
  const r = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: n }, () => ({
    result: r() < 0.7 ? "pass" : "fail",
    approval_status: r() < 0.2 ? "pending" : "none",
    duration_s: r() < 0.1 ? null : Math.floor(r() * 900),
    user_name: ["สมชาย", " สมชาย ", "", "Ann", null][Math.floor(r() * 5)],
  }));
}

describe("calcMetricAgg ตรงกับ calcMetric", () => {
  for (const [seed, n] of [[1, 0], [2, 1], [3, 17], [4, 500]] as const) {
    it(`seed ${seed} · ${n} แถว`, () => {
      const rs = rows(seed, n);
      for (const m of WIDGET_METRICS) expect(calcMetricAgg(aggOf(rs), m)).toBe(calcMetric(rs, m));
    });
  }
});
