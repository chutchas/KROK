// แม่แบบแดชบอร์ด — ชุดการ์ดตั้งต้นตามลักษณะงาน (ผู้ใช้แก้/เพิ่ม/ลบต่อได้เหมือนการ์ดปกติ)
import { formatLabel, metricLabel, rangeLabel, type DashWidget, type WidgetFormat, type WidgetMetric, type WidgetRange } from "./dashboard-meta";

export type DashTemplateKey = "inspect" | "log" | "approve" | "area";

export type W = [WidgetFormat, WidgetMetric, WidgetRange];
type L = { th: string; en: string };

export interface DashTemplate {
  key: DashTemplateKey;
  name: L;
  desc: L;
  /** การ์ดในชุด (ลำดับตามที่แสดง) */
  widgets: W[];
}

export const DASH_TEMPLATES: DashTemplate[] = [
  {
    key: "inspect",
    name: { th: "งานตรวจ / ความปลอดภัย", en: "Inspection / safety" },
    desc: { th: "ใบไม่ผ่าน เรื่องที่ยังไม่ปิด เวลาปิดเรื่อง และข้อที่ไม่ผ่านบ่อย", en: "Failures, open items, time to close and repeat failures" },
    widgets: [
      // จำนวนใบค้างอยู่ในแถบ "ต้องดูตอนนี้" แล้ว — ไม่ทำการ์ดตัวเลขซ้ำ
      ["stat", "usage", "7d"], ["stat", "fail", "7d"], ["stat", "closetime", "30d"],
      ["trend", "fail", "30d"], ["openlist", "usage", "all"], ["topfails", "usage", "7d"], ["ranking", "passrate", "30d"],
    ],
  },
  {
    key: "log",
    name: { th: "บันทึกข้อมูลประจำวัน", en: "Daily records" },
    desc: { th: "จำนวนที่บันทึก คนกรอก และแนวโน้มรายวัน — ไม่มีผ่าน/ไม่ผ่าน", en: "Entries, submitters and daily trend — no pass/fail" },
    widgets: [
      ["stat", "usage", "today"], ["stat", "usage", "7d"], ["stat", "submitters", "7d"],
      ["trend", "usage", "30d"], ["ranking", "usage", "7d"],
    ],
  },
  {
    key: "approve",
    name: { th: "งานอนุมัติ / เอกสาร", en: "Approvals / documents" },
    desc: { th: "รายการรออนุมัติ แยกตามฟอร์ม และปริมาณเอกสาร", en: "Pending approvals by form and document volume" },
    widgets: [
      // จำนวนรออนุมัติรวมอยู่ในแถบ "ต้องดูตอนนี้" แล้ว — การ์ดแยกตามฟอร์มแทน
      ["ranking", "pending", "all"], ["stat", "usage", "7d"], ["trend", "usage", "30d"],
    ],
  },
  {
    key: "area",
    name: { th: "ตามพื้นที่ / สาขา", en: "By area / branch" },
    desc: { th: "ใบที่ยังไม่จบในแต่ละพื้นที่ พร้อมปริมาณงาน", en: "Open work per area plus volume" },
    widgets: [
      ["area", "usage", "all"], ["stat", "usage", "7d"], ["ranking", "usage", "7d"], ["stat", "openfail", "30d"],
    ],
  },
];

const rid = () => Math.random().toString(36).slice(2, 10);

/** การ์ดของแม่แบบ (id ใหม่ทุกครั้ง — ใช้ซ้ำ/ต่อท้ายได้ไม่ชนกัน) */
export function templateWidgets(key: DashTemplateKey): DashWidget[] {
  const t = DASH_TEMPLATES.find((x) => x.key === key);
  return (t?.widgets ?? []).map(([format, metric, range]) => ({ id: rid(), format, formId: "all", metric, range }));
}

export interface TemplateSignals {
  /** มีใบไม่ผ่านใน 90 วันล่าสุด */
  hasFails: boolean;
  /** มีฟอร์มที่ต้องอนุมัติ */
  hasApproval: boolean;
  /** จำนวนพื้นที่ที่เปิดใช้ */
  areaCount: number;
}

/** แม่แบบแนะนำ + เหตุผล (แสดงในตัวเลือก) */
export function recommendTemplate(s: TemplateSignals): { key: DashTemplateKey; why: L } {
  if (s.hasFails) return { key: "inspect", why: { th: "พบใบไม่ผ่านใน 90 วันล่าสุด", en: "Failures found in the last 90 days" } };
  if (s.hasApproval) return { key: "approve", why: { th: "มีฟอร์มที่ต้องอนุมัติ", en: "Some forms require approval" } };
  if (s.areaCount >= 2) return { key: "area", why: { th: `มี ${s.areaCount} พื้นที่`, en: `${s.areaCount} areas set up` } };
  return { key: "log", why: { th: "ยังไม่พบผลตรวจผ่าน/ไม่ผ่าน", en: "No pass/fail results yet" } };
}

/** คำอธิบายการ์ดหนึ่งใบในตัวเลือกแม่แบบ: "ตัวเลขใหญ่ · ใบไม่ผ่าน · 7 วัน" */
export function templateCardLabel([format, metric, range]: W, en = false): string {
  const parts = [formatLabel(format, en)];
  if (format === "stat" || format === "trend" || format === "ranking") parts.push(metricLabel(metric, en));
  if (format !== "area" && format !== "openlist") parts.push(rangeLabel(range, en));
  return parts.join(" · ");
}

/** การ์ดตั้งค่าเหมือนกัน (รูปแบบ · ฟอร์ม/พื้นที่ · ค่า · ช่วงเวลา) — ไม่สนใจ id */
export const sameWidget = (a: DashWidget, b: DashWidget) =>
  a.format === b.format && a.formId === b.formId && a.metric === b.metric && a.range === b.range;

/** การ์ดของแม่แบบที่ยังไม่มีในชุดเดิม — ใช้ตอน "ต่อท้าย" กันการ์ดซ้ำ */
export function newTemplateWidgets(key: DashTemplateKey, existing: DashWidget[]): DashWidget[] {
  return templateWidgets(key).filter((w) => !existing.some((e) => sameWidget(e, w)));
}

/** ค่าเริ่มต้นของ "เพิ่มการ์ด" — ตัวเลือกแรกที่ยังไม่มีในชุด (ไม่ให้ขึ้นเตือนการ์ดซ้ำตั้งแต่เปิด) */
const STARTERS: W[] = [
  ["stat", "usage", "7d"], ["stat", "usage", "today"], ["stat", "usage", "30d"], ["stat", "submitters", "7d"],
  ["stat", "fail", "7d"], ["stat", "pending", "all"], ["stat", "passrate", "30d"], ["trend", "usage", "30d"], ["ranking", "usage", "7d"],
];
export function freshWidget(existing: DashWidget[]): DashWidget {
  const id = rid();
  for (const [format, metric, range] of STARTERS) {
    const w: DashWidget = { id, format, formId: "all", metric, range };
    if (!existing.some((e) => sameWidget(e, w))) return w;
  }
  return { id, format: "stat", formId: "all", metric: "usage", range: "7d" };
}
