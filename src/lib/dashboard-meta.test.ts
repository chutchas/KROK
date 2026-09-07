import { describe, it, expect } from "vitest";
import { calcMetric, trendDays, metricLabel, rangeLabel, type MetricRow } from "./dashboard-meta";

const rows: MetricRow[] = [
  { result: "pass", approval_status: "approved", duration_s: 10, user_name: "a" },
  { result: "fail", approval_status: "pending", duration_s: 20, user_name: "b" },
  { result: "pass", approval_status: "pending", duration_s: null, user_name: "a" },
  { result: "fail", approval_status: "none", duration_s: 30, user_name: "" },
];

describe("calcMetric", () => {
  it("usage = จำนวนแถว", () => expect(calcMetric(rows, "usage")).toBe(4));
  it("pending = นับ approval_status pending", () => expect(calcMetric(rows, "pending")).toBe(2));
  it("passrate = pass/(pass+fail) %", () => expect(calcMetric(rows, "passrate")).toBe(50));
  it("avgtime = เฉลี่ยเฉพาะที่มีค่า (10,20,30)/3 = 20", () => expect(calcMetric(rows, "avgtime")).toBe(20));
  it("submitters = ผู้กรอกไม่ซ้ำ ไม่นับค่าว่าง (a,b)", () => expect(calcMetric(rows, "submitters")).toBe(2));
  it("passrate ของชุดว่าง = 0 (ไม่ NaN)", () => expect(calcMetric([], "passrate")).toBe(0));
  it("avgtime ของชุดว่าง = 0", () => expect(calcMetric([], "avgtime")).toBe(0));
});

describe("trendDays", () => {
  it("7d/30d คงที่", () => {
    expect(trendDays("7d")).toBe(7);
    expect(trendDays("30d")).toBe(30);
  });
  it("month = วันที่ปัจจุบันของเดือน", () => {
    expect(trendDays("month", new Date(2026, 0, 15))).toBe(15);
  });
});

describe("labels", () => {
  it("มีคำแปลทั้ง TH และ EN", () => {
    expect(metricLabel("usage")).toBeTruthy();
    expect(metricLabel("usage", true)).toBeTruthy();
    expect(rangeLabel("7d")).toBeTruthy();
    expect(rangeLabel("7d", true)).toBeTruthy();
  });
});
