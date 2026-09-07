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
  priceThb: number;   // ยอดต่อเดือน (บาท) สำหรับออกใบแจ้งหนี้
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
    priceThb: 0,
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
    priceThb: 990,
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
    priceThb: 2990,
  },
};

export const PLAN_ORDER: PlanKey[] = ["free", "pro", "business"];

export function getPlan(key: string | null | undefined): Plan {
  return PLANS[(key as PlanKey) || "free"] ?? PLANS.free;
}

export function fmtLimit(n: number): string {
  return n >= UNLIMITED ? "∞" : String(n);
}

// ---- override ราคา/โควตา จากฝั่ง DB (ตั้งค่าระบบ) ----
export interface PlanOverride {
  name?: string;
  nameEn?: string;
  priceThb?: number;
  maxForms?: number;
  aiCreditsPerMonth?: number;
  maxMembers?: number;
  maxWorkspaces?: number;
}
export type PlanOverrides = Partial<Record<PlanKey, PlanOverride>>;

const numOr = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;

// รวม override ทับค่า default → ได้แผนที่ใช้จริง (ชื่อ/highlight คงจากโค้ด, ราคา label คำนวณจาก priceThb)
export function effectivePlans(ov: PlanOverrides = {}): Record<PlanKey, Plan> {
  const out = {} as Record<PlanKey, Plan>;
  for (const k of PLAN_ORDER) {
    const base = PLANS[k];
    const o = ov[k] || {};
    const priceThb = numOr(o.priceThb, base.priceThb);
    const str = (v: unknown, fallback: string) =>
      typeof v === "string" && v.trim() ? v.trim() : fallback;
    out[k] = {
      ...base,
      name: str(o.name, base.name),
      nameEn: str(o.nameEn, base.nameEn),
      priceThb,
      maxForms: numOr(o.maxForms, base.maxForms),
      aiCreditsPerMonth: numOr(o.aiCreditsPerMonth, base.aiCreditsPerMonth),
      maxMembers: numOr(o.maxMembers, base.maxMembers),
      maxWorkspaces: numOr(o.maxWorkspaces, base.maxWorkspaces),
      priceLabel: priceThb <= 0 ? "฿0 / เดือน" : `฿${priceThb.toLocaleString()} / เดือน`,
      priceLabelEn: priceThb <= 0 ? "฿0 / mo" : `฿${priceThb.toLocaleString()} / mo`,
    };
  }
  return out;
}
