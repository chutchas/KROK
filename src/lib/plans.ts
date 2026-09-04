// แคตตาล็อกแผนสมาชิก (client + server ใช้ร่วมกัน) — ยังไม่ผูกจ่ายเงินจริง
export type PlanKey = "free" | "pro" | "business";

export interface Plan {
  key: PlanKey;
  name: string;      // ชื่อไทย
  nameEn: string;
  priceLabel: string;   // แสดงผลอย่างเดียว
  priceLabelEn: string;
  maxForms: number;
  aiCreditsPerMonth: number;
  maxMembers: number;
  maxWorkspaces: number;
  highlight?: boolean;
}

export const UNLIMITED = 999999;

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: "free",
    name: "เริ่มต้น",
    nameEn: "Free",
    priceLabel: "฿0 / เดือน",
    priceLabelEn: "$0 / mo",
    maxForms: 3,
    aiCreditsPerMonth: 30,
    maxMembers: 3,
    maxWorkspaces: 1,
  },
  pro: {
    key: "pro",
    name: "โปร",
    nameEn: "Pro",
    priceLabel: "฿990 / เดือน",
    priceLabelEn: "$29 / mo",
    maxForms: 25,
    aiCreditsPerMonth: 500,
    maxMembers: 20,
    maxWorkspaces: 3,
    highlight: true,
  },
  business: {
    key: "business",
    name: "ธุรกิจ",
    nameEn: "Business",
    priceLabel: "฿2,990 / เดือน",
    priceLabelEn: "$89 / mo",
    maxForms: UNLIMITED,
    aiCreditsPerMonth: 5000,
    maxMembers: 200,
    maxWorkspaces: 20,
  },
};

export const PLAN_ORDER: PlanKey[] = ["free", "pro", "business"];

export function getPlan(key: string | null | undefined): Plan {
  return PLANS[(key as PlanKey) || "free"] ?? PLANS.free;
}

export function fmtLimit(n: number): string {
  return n >= UNLIMITED ? "∞" : String(n);
}
