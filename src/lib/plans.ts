// แคตตาล็อกแผนสมาชิก (client + server ใช้ร่วมกัน) — ยังไม่ผูกจ่ายเงินจริง
import { AI_PURPOSES, type AiPurpose } from "./ai-purpose";

export type PlanKey = "free" | "pro" | "business";

/**
 * โควตา AI แยกถังต่อ purpose
 * เหตุผล: doc_extract / photo_check ยิงมากกว่า form_gen เป็นร้อยเท่า
 *        ถ้าอยู่ถังเดียวกัน ใช้หน้างานหนัก → สร้างฟอร์มใหม่ไม่ได้ทั้งเดือน
 * หมายเหตุ: การสแกนบาร์โค้ด/QR ไม่อยู่ในนี้ — ทำงานบนเครื่องผู้ใช้ ไม่หักเครดิต
 */
export type AiCredits = Record<AiPurpose, number>;

export function sumCredits(c: AiCredits): number {
  return AI_PURPOSES.reduce((n, k) => n + (c[k] ?? 0), 0);
}

export interface Plan {
  key: PlanKey;
  name: string;      // ชื่อไทย
  nameEn: string;
  priceLabel: string;   // แสดงผลอย่างเดียว
  priceLabelEn: string;
  maxForms: number;
  aiCredits: AiCredits;
  /** ยอดรวมทุก purpose — ใช้แสดงภาพรวมเท่านั้น การบังคับใช้ดูที่ aiCredits รายตัว */
  aiCreditsPerMonth: number;
  maxMembers: number;
  maxWorkspaces: number;
  priceThb: number;   // ยอดต่อเดือน (บาท) สำหรับออกใบแจ้งหนี้
  highlight?: boolean;
}

export const UNLIMITED = 999999;

/** เติม aiCreditsPerMonth (ยอดรวม) ให้อัตโนมัติ เพื่อไม่ให้ตัวเลขสองที่หลุดกัน */
const mkPlan = (p: Omit<Plan, "aiCreditsPerMonth">): Plan => ({
  ...p,
  aiCreditsPerMonth: sumCredits(p.aiCredits),
});

export const PLANS: Record<PlanKey, Plan> = {
  free: mkPlan({
    key: "free",
    name: "เริ่มต้น",
    nameEn: "Free",
    priceLabel: "฿0 / เดือน",
    priceLabelEn: "$0 / mo",
    maxForms: 3,
    aiCredits: { form_gen: 20, form_from_image: 10, photo_check: 100, doc_extract: 50 },
    maxMembers: 3,
    maxWorkspaces: 1,
    priceThb: 0,
  }),
  pro: mkPlan({
    key: "pro",
    name: "โปร",
    nameEn: "Pro",
    priceLabel: "฿990 / เดือน",
    priceLabelEn: "$29 / mo",
    maxForms: 25,
    aiCredits: { form_gen: 200, form_from_image: 100, photo_check: 3000, doc_extract: 1500 },
    maxMembers: 20,
    maxWorkspaces: 3,
    priceThb: 990,
    highlight: true,
  }),
  business: mkPlan({
    key: "business",
    name: "ธุรกิจ",
    nameEn: "Business",
    priceLabel: "฿2,990 / เดือน",
    priceLabelEn: "$89 / mo",
    maxForms: UNLIMITED,
    aiCredits: { form_gen: 1000, form_from_image: 500, photo_check: 30000, doc_extract: 15000 },
    maxMembers: 200,
    maxWorkspaces: 20,
    priceThb: 2990,
  }),
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
  aiCredits?: Partial<AiCredits>;
  /** @deprecated รูปแบบเดิม (ถังเดียว) — ถ้ามีค่านี้และไม่มี aiCredits จะใช้เป็นลิมิตของทุก purpose */
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
    // ค่าเดิมแบบถังเดียว: ถ้ายังไม่ได้ตั้งแบบใหม่ ให้ใช้เป็นลิมิตของทุก purpose
    const legacy = typeof o.aiCreditsPerMonth === "number" ? o.aiCreditsPerMonth : undefined;
    const aiCredits = AI_PURPOSES.reduce((acc, k) => {
      acc[k] = numOr(o.aiCredits?.[k], legacy ?? base.aiCredits[k]);
      return acc;
    }, {} as AiCredits);
    const str = (v: unknown, fallback: string) =>
      typeof v === "string" && v.trim() ? v.trim() : fallback;
    out[k] = {
      ...base,
      name: str(o.name, base.name),
      nameEn: str(o.nameEn, base.nameEn),
      priceThb,
      maxForms: numOr(o.maxForms, base.maxForms),
      aiCredits,
      aiCreditsPerMonth: sumCredits(aiCredits),
      maxMembers: numOr(o.maxMembers, base.maxMembers),
      maxWorkspaces: numOr(o.maxWorkspaces, base.maxWorkspaces),
      priceLabel: priceThb <= 0 ? "฿0 / เดือน" : `฿${priceThb.toLocaleString()} / เดือน`,
      priceLabelEn: priceThb <= 0 ? "฿0 / mo" : `฿${priceThb.toLocaleString()} / mo`,
    };
  }
  return out;
}
