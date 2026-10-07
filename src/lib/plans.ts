// ============================================================
// KROK · แคตตาล็อกแพ็กเกจ (client + server ใช้ร่วมกัน)
// - แพ็กเกจตั้งต้น 3 ตัว (free/pro/business) อยู่ในโค้ด = ค่าเริ่มต้น/ค่าสำรอง
// - Platform Admin สร้าง/แก้/ซ่อน/เรียงแพ็กเกจได้ → เก็บใน platform_plan_settings.plans รูปแบบ { v: 2, catalog: Plan[] }
//   (รูปแบบเดิม = override ราคา/โควตาของ 3 แพ็กเกจ — ยังอ่านได้ แปลงให้อัตโนมัติ)
// - ฝั่ง DB อ่านลิมิตชุดเดียวกันผ่าน public.plan_limit() (migration 0044) เพื่อบังคับใช้ใน trigger
// ============================================================
import { AI_PURPOSES, type AiPurpose } from "./ai-purpose";

/** key ของแพ็กเกจ — ตั้งต้น free/pro/business · แพ็กเกจที่สร้างเพิ่มเป็น slug ที่แอดมินตั้ง */
export type PlanKey = string;
export const BUILTIN_KEYS = ["free", "pro", "business"] as const;

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

export const UNLIMITED = 999999;

/** ลิมิตที่เป็นตัวเลข (UNLIMITED = ไม่จำกัด · 0 = ใช้ไม่ได้) */
export const NUM_LIMITS = [
  "maxForms", "maxMembers", "maxWorkspaces",
  "maxSubmissionsMonth", "storageMb",
  "maxDatasets", "maxDatasetRows",
  "maxWebhooks", "maxIntakeForms", "maxDatasetApi",
  "maxApprovalSteps", "maxDevices", "auditDays",
] as const;
export type NumLimit = (typeof NUM_LIMITS)[number];
/** สิทธิ์เปิด/ปิด */
export const FLAG_LIMITS = ["notify", "workflow"] as const;
export type FlagLimit = (typeof FLAG_LIMITS)[number];

export interface Plan extends Record<NumLimit, number>, Record<FlagLimit, boolean> {
  key: PlanKey;
  name: string;      // ชื่อไทย
  nameEn: string;
  /** คำอธิบายสั้นใต้ชื่อ (หน้า home / แผน) */
  desc: string;
  descEn: string;
  priceLabel: string;   // แสดงผลอย่างเดียว (คำนวณจาก priceThb)
  priceLabelEn: string;
  priceThb: number;   // ยอดต่อเดือน (บาท) สำหรับออกใบแจ้งหนี้
  aiCredits: AiCredits;
  /** ยอดรวมทุก purpose — ใช้แสดงภาพรวมเท่านั้น การบังคับใช้ดูที่ aiCredits รายตัว */
  aiCreditsPerMonth: number;
  highlight?: boolean;
  /** แสดงให้ลูกค้าเห็น/เลือกเองได้ (ซ่อน = ใช้กับดีลพิเศษ เช่น Enterprise ที่แอดมินกำหนดให้) */
  visible: boolean;
  /** ลำดับการแสดง (น้อย = ก่อน) */
  sort: number;
  /** ข้อดีเพิ่มเติมที่แอดมินพิมพ์เอง (บรรทัดละข้อ) — ต่อท้ายรายการลิมิตอัตโนมัติ */
  extras: string[];
  extrasEn: string[];
  builtin: boolean;
}

/** ค่าเริ่มต้นของแพ็กเกจตั้งต้น (ตารางที่ตกลงไว้) */
const BASE: Omit<Plan, "aiCreditsPerMonth" | "priceLabel" | "priceLabelEn">[] = [
  {
    key: "free", name: "เริ่มต้น", nameEn: "Free", desc: "ทดลองใช้ ทีมเล็ก", descEn: "Try it out, small teams",
    priceThb: 0, sort: 10, visible: true, builtin: true, extras: [], extrasEn: [],
    aiCredits: { form_gen: 20, form_from_image: 10, photo_check: 100, doc_extract: 50 },
    maxForms: 3, maxMembers: 3, maxWorkspaces: 1, maxSubmissionsMonth: 300, storageMb: 1024,
    maxDatasets: 2, maxDatasetRows: 1000, maxWebhooks: 0, maxIntakeForms: 0, maxDatasetApi: 0,
    maxApprovalSteps: 1, maxDevices: 0, auditDays: 7, notify: false, workflow: false,
  },
  {
    key: "pro", name: "โปร", nameEn: "Pro", desc: "ทีมที่ใช้งานจริงทุกวัน", descEn: "For teams in daily operation",
    priceThb: 990, sort: 20, visible: true, builtin: true, highlight: true, extras: [], extrasEn: [],
    aiCredits: { form_gen: 200, form_from_image: 100, photo_check: 3000, doc_extract: 1500 },
    maxForms: 25, maxMembers: 20, maxWorkspaces: 3, maxSubmissionsMonth: 5000, storageMb: 20480,
    maxDatasets: 20, maxDatasetRows: 20000, maxWebhooks: 3, maxIntakeForms: 3, maxDatasetApi: 3,
    maxApprovalSteps: 3, maxDevices: 20, auditDays: 90, notify: true, workflow: true,
  },
  {
    key: "business", name: "ธุรกิจ", nameEn: "Business", desc: "หลายสาขา เชื่อมระบบเต็มรูปแบบ", descEn: "Multi-site, full integration",
    priceThb: 2990, sort: 30, visible: true, builtin: true, extras: [], extrasEn: [],
    aiCredits: { form_gen: 1000, form_from_image: 500, photo_check: 30000, doc_extract: 15000 },
    maxForms: UNLIMITED, maxMembers: 200, maxWorkspaces: 20, maxSubmissionsMonth: UNLIMITED, storageMb: 204800,
    maxDatasets: UNLIMITED, maxDatasetRows: 200000, maxWebhooks: 20, maxIntakeForms: UNLIMITED, maxDatasetApi: 20,
    maxApprovalSteps: UNLIMITED, maxDevices: UNLIMITED, auditDays: 365, notify: true, workflow: true,
  },
];

export function priceLabels(priceThb: number): { priceLabel: string; priceLabelEn: string } {
  return priceThb <= 0
    ? { priceLabel: "฿0 / เดือน", priceLabelEn: "฿0 / mo" }
    : { priceLabel: `฿${priceThb.toLocaleString("en-US")} / เดือน`, priceLabelEn: `฿${priceThb.toLocaleString("en-US")} / mo` };
}

/** เติมค่าที่คำนวณได้ (ยอดรวม AI / label ราคา) */
const finish = (p: Omit<Plan, "aiCreditsPerMonth" | "priceLabel" | "priceLabelEn">): Plan => ({
  ...p,
  highlight: !!p.highlight,
  aiCreditsPerMonth: sumCredits(p.aiCredits),
  ...priceLabels(p.priceThb),
});

export const DEFAULT_PLANS: Plan[] = BASE.map(finish);
export const PLANS: Record<PlanKey, Plan> = Object.fromEntries(DEFAULT_PLANS.map((p) => [p.key, p]));
/** ลำดับแพ็กเกจตั้งต้น (ใช้กับข้อมูลรูปแบบเดิม) */
export const PLAN_ORDER: PlanKey[] = [...BUILTIN_KEYS];

export function fmtLimit(n: number): string {
  return n >= UNLIMITED ? "∞" : n.toLocaleString("en-US");
}

export const PLAN_KEY_RE = /^[a-z][a-z0-9_-]{1,29}$/;

// ---------- อ่าน/ทำความสะอาดข้อมูลจาก DB ----------

const numOr = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(UNLIMITED, Math.floor(v)) : fallback;
const strOr = (v: unknown, fallback: string, max = 60) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
const lines = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 8);

/**
 * ทำความสะอาดแพ็กเกจ 1 ตัว (จาก DB หรือจากฟอร์มแอดมิน) ทับบน base
 * ค่าที่ไม่ถูกต้อง = ใช้ค่าของ base แทน
 */
export function cleanPlan(raw: unknown, base: Plan): Plan {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // ค่าเดิมแบบถังเดียว: ถ้ายังไม่ได้ตั้งแบบใหม่ ให้ใช้เป็นลิมิตของทุก purpose
  const legacy = typeof o.aiCreditsPerMonth === "number" && !o.aiCredits ? o.aiCreditsPerMonth : undefined;
  const credits = (o.aiCredits && typeof o.aiCredits === "object" ? o.aiCredits : {}) as Record<string, unknown>;
  const aiCredits = AI_PURPOSES.reduce((acc, k) => {
    acc[k] = numOr(credits[k], legacy !== undefined ? numOr(legacy, base.aiCredits[k]) : base.aiCredits[k]);
    return acc;
  }, {} as AiCredits);
  const out = {
    key: base.key,
    name: strOr(o.name, base.name, 40),
    nameEn: strOr(o.nameEn, base.nameEn, 40),
    desc: typeof o.desc === "string" ? o.desc.trim().slice(0, 80) : base.desc,
    descEn: typeof o.descEn === "string" ? o.descEn.trim().slice(0, 80) : base.descEn,
    priceThb: numOr(o.priceThb, base.priceThb),
    aiCredits,
    highlight: typeof o.highlight === "boolean" ? o.highlight : !!base.highlight,
    visible: typeof o.visible === "boolean" ? o.visible : base.visible,
    sort: typeof o.sort === "number" && Number.isFinite(o.sort) ? Math.round(o.sort) : base.sort,
    extras: "extras" in o ? lines(o.extras) : base.extras,
    extrasEn: "extrasEn" in o ? lines(o.extrasEn) : base.extrasEn,
    builtin: (BUILTIN_KEYS as readonly string[]).includes(base.key),
  } as Omit<Plan, "aiCreditsPerMonth" | "priceLabel" | "priceLabelEn">;
  for (const k of NUM_LIMITS) (out as Record<string, unknown>)[k] = numOr(o[k], base[k]);
  for (const k of FLAG_LIMITS) (out as Record<string, unknown>)[k] = typeof o[k] === "boolean" ? o[k] : base[k];
  return finish(out);
}

/** แพ็กเกจใหม่ที่ยังไม่ได้ตั้งค่า — เริ่มจากค่าของ Pro */
export function blankPlan(key: string): Plan {
  return { ...PLANS.pro, key, name: key, nameEn: key, desc: "", descEn: "", highlight: false, visible: false, builtin: false, extras: [], extrasEn: [], sort: 100 };
}

export interface CatalogV2 { v: 2; catalog: unknown[] }

/**
 * แปลงข้อมูลใน DB → รายการแพ็กเกจที่ใช้จริง (เรียงตาม sort)
 * - { v: 2, catalog } = แคตตาล็อกเต็ม · แพ็กเกจตั้งต้นที่หายไปถูกเติมกลับ (ลบไม่ได้)
 * - รูปแบบเดิม { free: {...}, pro: {...} } = override ทับค่าเริ่มต้น
 */
export function normalizeCatalog(raw: unknown): Plan[] {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = new Map<string, Plan>();
  if (r.v === 2 && Array.isArray(r.catalog)) {
    for (const item of r.catalog) {
      const key = (item as { key?: unknown } | null)?.key;
      if (typeof key !== "string" || !PLAN_KEY_RE.test(key) || out.has(key)) continue;
      out.set(key, cleanPlan(item, PLANS[key] ?? blankPlan(key)));
    }
  } else {
    for (const k of BUILTIN_KEYS) if (r[k]) out.set(k, cleanPlan(r[k], PLANS[k]));
  }
  for (const p of DEFAULT_PLANS) if (!out.has(p.key)) out.set(p.key, p);
  // free ต้องแสดงเสมอ (เป็นแผนตั้งต้นของ workspace ใหม่)
  const free = out.get("free")!;
  if (!free.visible) out.set("free", { ...free, visible: true });
  return Array.from(out.values()).sort((a, b) => a.sort - b.sort || a.priceThb - b.priceThb);
}

export function catalogRecord(list: Plan[]): Record<PlanKey, Plan> {
  return Object.fromEntries(list.map((p) => [p.key, p]));
}

/** แพ็กเกจของ key นี้ (ไม่พบ/ถูกลบ = free) */
export function getPlan(key: string | null | undefined, plans: Record<PlanKey, Plan> = PLANS): Plan {
  return (key && plans[key]) || plans.free || PLANS.free;
}

/** แปลงเป็นรูปแบบที่เก็บใน DB (ตัดค่าที่คำนวณได้ออก) */
export function toStored(list: Plan[]): CatalogV2 {
  return {
    v: 2,
    catalog: list.map((p) => {
      const { priceLabel: _a, priceLabelEn: _b, aiCreditsPerMonth: _c, builtin: _d, ...rest } = p;
      void _a; void _b; void _c; void _d;
      return rest;
    }),
  };
}

// ---------- ข้อความรายการสิทธิ์ (หน้า home / แผน) ----------

export interface FeatureLine { text: string; off?: boolean }

const gb = (mb: number) => (mb >= UNLIMITED ? "∞" : mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`);

/** รายการสิทธิ์ของแพ็กเกจ เรียงตามความสำคัญ — off = ไม่มีสิทธิ์ (แสดงขีดฆ่า) */
export function planFeatures(p: Plan, en: boolean): FeatureLine[] {
  const L = (th: string, eng: string, off = false): FeatureLine => ({ text: en ? eng : th, off });
  const n = fmtLimit;
  const out: FeatureLine[] = [
    L(`ฟอร์ม ${n(p.maxForms)} แบบ`, `${n(p.maxForms)} forms`),
    L(`ผู้ใช้ ${n(p.maxMembers)} คน · ${n(p.maxWorkspaces)} workspace`, `${n(p.maxMembers)} users · ${n(p.maxWorkspaces)} workspace${p.maxWorkspaces === 1 ? "" : "s"}`),
    L(`ส่งฟอร์ม ${n(p.maxSubmissionsMonth)} ครั้ง/เดือน`, `${n(p.maxSubmissionsMonth)} submissions / month`),
    L(`พื้นที่ไฟล์ ${gb(p.storageMb)}`, `${gb(p.storageMb)} file storage`),
    L(`AI ${n(p.aiCreditsPerMonth)} ครั้ง/เดือน`, `${n(p.aiCreditsPerMonth)} AI credits / month`),
    L(`ถังข้อมูล ${n(p.maxDatasets)} ชุด (ชุดละ ${n(p.maxDatasetRows)} แถว)`, `${n(p.maxDatasets)} datasets (${n(p.maxDatasetRows)} rows each)`),
    L(`ขั้นอนุมัติ ${n(p.maxApprovalSteps)} ขั้น`, `${n(p.maxApprovalSteps)} approval step${p.maxApprovalSteps === 1 ? "" : "s"}`),
    L("ฟอร์มกรอกหลายคน (ส่งต่องาน)", "Multi-person workflow", !p.workflow),
    L("แจ้งเตือน LINE / อีเมล", "LINE / email notifications", !p.notify),
    L(p.maxWebhooks ? `Webhook ${n(p.maxWebhooks)} เส้น` : "Webhook", p.maxWebhooks ? `${n(p.maxWebhooks)} webhooks` : "Webhooks", !p.maxWebhooks),
    L(p.maxIntakeForms ? `API รับข้อมูล ${n(p.maxIntakeForms)} ฟอร์ม` : "API รับข้อมูลเข้า", p.maxIntakeForms ? `Intake API on ${n(p.maxIntakeForms)} forms` : "Intake API", !p.maxIntakeForms),
    L(p.maxDevices ? `ล็อกอุปกรณ์ ${n(p.maxDevices)} เครื่อง` : "ล็อกอุปกรณ์", p.maxDevices ? `${n(p.maxDevices)} locked devices` : "Device lock", !p.maxDevices),
    L(`ประวัติการใช้งาน ${p.auditDays} วัน`, `${p.auditDays}-day audit log`),
  ];
  for (const x of en ? p.extrasEn : p.extras) out.push({ text: x });
  return out;
}

// ---------- ความเข้ากันกับโค้ดเดิม ----------
export interface PlanOverride { [k: string]: unknown }
export type PlanOverrides = Record<string, PlanOverride>;
/** @deprecated ใช้ normalizeCatalog — คงไว้ให้เทสต์/โค้ดเดิม */
export function effectivePlans(ov: PlanOverrides = {}): Record<PlanKey, Plan> {
  return catalogRecord(normalizeCatalog(ov));
}

/** แพ็กเกจที่ถูกที่สุด (ที่ลูกค้าเลือกเองได้) ซึ่งมีฟีเจอร์นี้ — ใช้บอก "มีในแพ็กเกจ X ขึ้นไป" */
export function cheapestWith(plans: Record<PlanKey, Plan>, has: (p: Plan) => boolean): Plan | null {
  return Object.values(plans).filter((p) => p.visible && has(p)).sort((a, b) => a.priceThb - b.priceThb || a.sort - b.sort)[0] ?? null;
}
