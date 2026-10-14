// แม่แบบแดชบอร์ด — ชุดการ์ดตั้งต้นตามลักษณะงาน (ผู้ใช้แก้/เพิ่ม/ลบต่อได้เหมือนการ์ดปกติ)
import type { DashWidget, WidgetFormat, WidgetMetric, WidgetRange } from "./dashboard-meta";

export type DashTemplateKey = "inspect" | "log" | "approve" | "area";

type W = [WidgetFormat, WidgetMetric, WidgetRange];
type L = { th: string; en: string };

export interface DashTemplate {
  key: DashTemplateKey;
  emoji: string;
  name: L;
  desc: L;
  /** การ์ดในชุด (ลำดับตามที่แสดง) */
  widgets: W[];
}

export const DASH_TEMPLATES: DashTemplate[] = [
  {
    key: "inspect",
    emoji: "🛡️",
    name: { th: "งานตรวจ / ความปลอดภัย", en: "Inspection / safety" },
    desc: { th: "ใบไม่ผ่าน เรื่องที่ยังไม่ปิด เวลาปิดเรื่อง และข้อที่ไม่ผ่านบ่อย", en: "Failures, open items, time to close and repeat failures" },
    widgets: [
      ["stat", "usage", "7d"], ["stat", "fail", "7d"], ["stat", "openfail", "all"], ["stat", "closetime", "30d"],
      ["trend", "fail", "30d"], ["openlist", "usage", "all"], ["topfails", "usage", "7d"], ["ranking", "passrate", "30d"],
    ],
  },
  {
    key: "log",
    emoji: "📒",
    name: { th: "บันทึกข้อมูลประจำวัน", en: "Daily records" },
    desc: { th: "จำนวนที่บันทึก คนกรอก และแนวโน้มรายวัน — ไม่มีผ่าน/ไม่ผ่าน", en: "Entries, submitters and daily trend — no pass/fail" },
    widgets: [
      ["stat", "usage", "today"], ["stat", "usage", "7d"], ["stat", "submitters", "7d"],
      ["trend", "usage", "30d"], ["ranking", "usage", "7d"],
    ],
  },
  {
    key: "approve",
    emoji: "✅",
    name: { th: "งานอนุมัติ / เอกสาร", en: "Approvals / documents" },
    desc: { th: "รายการรออนุมัติ แยกตามฟอร์ม และปริมาณเอกสาร", en: "Pending approvals by form and document volume" },
    widgets: [
      ["stat", "pending", "all"], ["stat", "usage", "7d"], ["ranking", "pending", "all"], ["trend", "usage", "30d"],
    ],
  },
  {
    key: "area",
    emoji: "📍",
    name: { th: "ตามพื้นที่ / สาขา", en: "By area / branch" },
    desc: { th: "ใบที่ยังไม่จบในแต่ละพื้นที่ พร้อมปริมาณงาน", en: "Open work per area plus volume" },
    widgets: [
      ["area", "usage", "all"], ["stat", "usage", "7d"], ["ranking", "usage", "7d"], ["stat", "openfail", "all"],
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
