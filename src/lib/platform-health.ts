import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_PURPOSES, PURPOSE_LABELS, resolveConfig, type AiPurpose } from "@/lib/ai";
import { gatewayConfig } from "@/lib/billing-gateway";

// ============================================================
// ตรวจสุขภาพระบบสำหรับหน้า Platform Admin › Health
// ทุกข้อเช็กอัตโนมัติทุกครั้งที่เปิดหน้า (ไม่มีค่าใช้จ่าย) — ยกเว้นการยิงทดสอบ AI (กดปุ่มเอง)
// ไม่คืนค่าความลับใด ๆ (บอกแค่ว่าตั้งแล้วหรือยัง)
// ============================================================

export type HealthStatus = "ok" | "warn" | "fail" | "off";
export interface HealthCheck {
  name: string;
  status: HealthStatus;
  detail: string;
  ms?: number;
  /** ลิงก์ไปหน้าที่แก้/ดูเพิ่ม */
  href?: string;
}
export interface HealthGroup {
  title: string;
  checks: HealthCheck[];
}
export interface AiProfileInfo {
  purpose: AiPurpose;
  label: string;
  provider: string;
  model: string;
  hasKey: boolean;
}
export interface HealthReport {
  groups: HealthGroup[];
  ai: AiProfileInfo[];
  stats: { tenants?: number; users?: number; submissions24h?: number; dbSizeBytes?: number };
  checkedAt: string;
}

const REQUIRED_BUCKETS = ["submissions", "attachments", "drafts", "cases", "avatars", "branding"];
const MIGRATIONS: [string, string][] = [
  ["m0050", "0050_form_summary"], ["m0051", "0051_account_deletion"], ["m0052", "0052_ai_credit_lock"],
  ["m0053", "0053_error_events"], ["m0054", "0054_form_visibility_rls"], ["m0055", "0055_mfa"],
  ["m0056", "0056_branding"], ["m0057", "0057_security_hardening"], ["m0058", "0058_platform_ops"],
];
// [job, ชื่อ, ไม่ได้รันเกินกี่ชั่วโมง = เตือน] · schedule = pg_cron ทุก 5 นาที (0064)
const CRON_JOBS: [string, string, number][] = [["billing", "รอบบิล / เตือนหมดอายุ", 26], ["cleanup", "ลบแบบร่างหมดอายุ", 26], ["datasets", "sync ข้อมูลอ้างอิง (API pull)", 26], ["schedule", "แจ้งเตือนรอบตรวจ (pg_cron)", 0.5]];

async function timed<T>(fn: () => Promise<T>): Promise<{ v?: T; e?: string; ms: number }> {
  const t0 = Date.now();
  try {
    const v = await fn();
    return { v, ms: Date.now() - t0 };
  } catch (e) {
    return { e: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}

const env = (k: string) => !!process.env[k]?.trim();

export async function runHealth(admin: SupabaseClient): Promise<HealthReport> {
  const groups: HealthGroup[] = [];
  const stats: HealthReport["stats"] = {};

  // ---------- Supabase ----------
  const [db, auth, buckets, ph] = await Promise.all([
    timed(async () => {
      const { error } = await admin.from("tenants").select("id", { head: true, count: "exact" });
      if (error) throw new Error(error.message);
    }),
    timed(async () => {
      const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) throw new Error(error.message);
    }),
    timed(async () => {
      const { data, error } = await admin.storage.listBuckets();
      if (error) throw new Error(error.message);
      return (data || []).map((b) => b.id);
    }),
    timed(async () => {
      const { data, error } = await admin.rpc("platform_health");
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    }),
  ]);
  const missingBuckets = buckets.v ? REQUIRED_BUCKETS.filter((b) => !buckets.v!.includes(b)) : [];
  groups.push({
    title: "Supabase",
    checks: [
      { name: "ฐานข้อมูล", status: db.e ? "fail" : db.ms > 1500 ? "warn" : "ok", detail: db.e ?? (db.ms > 1500 ? "ตอบช้า" : "เชื่อมต่อได้"), ms: db.ms },
      { name: "ระบบล็อกอิน (Auth)", status: auth.e ? "fail" : "ok", detail: auth.e ?? "เชื่อมต่อได้", ms: auth.ms },
      {
        name: "Storage", ms: buckets.ms,
        status: buckets.e ? "fail" : missingBuckets.length ? "warn" : "ok",
        detail: buckets.e ?? (missingBuckets.length ? `ไม่มี bucket: ${missingBuckets.join(", ")} (รัน migration ที่สร้าง bucket นั้น)` : `bucket ครบ ${REQUIRED_BUCKETS.length} ตัว`),
      },
    ],
  });

  // ---------- Migration ----------
  const mig: HealthCheck[] = [];
  if (ph.e || !ph.v) {
    mig.push({ name: "สถานะ migration", status: "warn", detail: "ยังไม่ได้รัน 0058_platform_ops — รันก่อนเพื่อดูรายละเอียด" });
  } else {
    const h = ph.v;
    const missing = MIGRATIONS.filter(([k]) => h[k] !== true).map(([, f]) => f);
    mig.push({ name: "migration 0050–0058", status: missing.length ? "fail" : "ok", detail: missing.length ? `ยังไม่ได้รัน: ${missing.join(", ")}` : "รันครบ" });
    mig.push({
      name: "ด่าน 2FA ระดับ RPC (pre-request)", status: h.pre_request === true ? "ok" : "warn",
      detail: h.pre_request === true ? "เปิดอยู่" : "ยังไม่ได้ตั้ง — รัน 0057 ใหม่ หรือตั้ง pgrst.db_pre_request ให้ role authenticator",
    });
    stats.tenants = Number(h.tenants) || 0;
    stats.users = Number(h.users) || 0;
    stats.submissions24h = Number(h.submissions_24h) || 0;
    stats.dbSizeBytes = Number(h.db_size_bytes) || 0;
  }
  groups.push({ title: "ฐานข้อมูล (migration)", checks: mig });

  // ---------- ค่าตั้งของ Vercel (env) ----------
  const envCheck = (k: string, required: boolean, why: string): HealthCheck => ({
    name: k, status: env(k) ? "ok" : required ? "fail" : "warn", detail: env(k) ? "ตั้งแล้ว" : `ยังไม่ได้ตั้ง — ${why}`,
  });
  groups.push({
    title: "ค่าตั้งของ Vercel (Environment Variables)",
    checks: [
      envCheck("SUPABASE_SERVICE_ROLE_KEY", true, "ส่งฟอร์ม/ฟอร์มสาธารณะ/audit ทำงานไม่ได้"),
      envCheck("CRON_SECRET", true, "งานตั้งเวลาไม่ทำงาน"),
      envCheck("NEXT_PUBLIC_SITE_URL", false, "ลิงก์ในอีเมลใช้โดเมนหลักของ Vercel แทน"),
      envCheck("RESEND_API_KEY", false, "ไม่ส่งอีเมลเชิญ (ต้องคัดลอกลิงก์เอง)"),
      envCheck("EMAIL_FROM", false, "ใช้ผู้ส่งทดสอบของ Resend (ส่งได้เฉพาะถึงเจ้าของบัญชี Resend)"),
      { name: "ข้อมูลผู้ให้บริการ (PDPA)", status: env("NEXT_PUBLIC_LEGAL_NAME") && env("NEXT_PUBLIC_PRIVACY_EMAIL") ? "ok" : "warn",
        detail: env("NEXT_PUBLIC_LEGAL_NAME") && env("NEXT_PUBLIC_PRIVACY_EMAIL") ? "ตั้งแล้ว" : "ยังไม่ได้ตั้ง NEXT_PUBLIC_LEGAL_NAME / NEXT_PUBLIC_PRIVACY_EMAIL — หน้านโยบายแสดงข้อความแทนที่" },
    ],
  });

  // ---------- บริการภายนอก ----------
  const ext: HealthCheck[] = [];
  if (env("RESEND_API_KEY")) {
    const r = await timed(async () => {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(6000), cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { name?: string; data?: { name: string; status: string }[] };
      return { status: res.status, j };
    });
    if (r.e) ext.push({ name: "อีเมล (Resend)", status: "fail", detail: `เชื่อมต่อไม่ได้: ${r.e}`, ms: r.ms });
    else if (r.v!.status === 200) {
      const domains = r.v!.j.data ?? [];
      const verified = domains.filter((d) => d.status === "verified").map((d) => d.name);
      ext.push({ name: "อีเมล (Resend)", status: verified.length ? "ok" : "warn", ms: r.ms,
        detail: verified.length ? `คีย์ใช้ได้ · โดเมนที่ยืนยันแล้ว: ${verified.join(", ")}` : "คีย์ใช้ได้ แต่ยังไม่มีโดเมนที่ยืนยัน — ส่งได้เฉพาะถึงอีเมลเจ้าของบัญชี Resend" });
    } else if (r.v!.j.name === "restricted_api_key") {
      ext.push({ name: "อีเมล (Resend)", status: "ok", detail: "คีย์ใช้ได้ (สิทธิ์ส่งอย่างเดียว — ตรวจโดเมนไม่ได้)", ms: r.ms });
    } else {
      ext.push({ name: "อีเมล (Resend)", status: "fail", detail: `คีย์ไม่ถูกต้อง (HTTP ${r.v!.status})`, ms: r.ms });
    }
  } else {
    ext.push({ name: "อีเมล (Resend)", status: "off", detail: "ไม่ได้ตั้ง RESEND_API_KEY" });
  }
  ext.push(gatewayConfig()
    ? { name: "Payment Gateway", status: process.env.PAYMENTS_LIVE === "1" ? "ok" : "warn", detail: process.env.PAYMENTS_LIVE === "1" ? "ตั้งค่าครบ · เปิดขายจริง" : "ตั้งค่าครบ แต่ยังไม่เปิดขายจริง (PAYMENTS_LIVE ไม่ใช่ 1)" }
    : { name: "Payment Gateway", status: "off", detail: "ยังไม่ได้ตั้ง — ซื้อแพ็กเกจเสียเงินไม่ได้" });

  // AI: แสดงการตั้งค่า (ยิงทดสอบจริงด้วยปุ่มในหน้า)
  const ai: AiProfileInfo[] = await Promise.all(AI_PURPOSES.map(async (p) => {
    const cfg = await resolveConfig(p).catch(() => null);
    return { purpose: p, label: PURPOSE_LABELS[p], provider: cfg?.provider ?? "-", model: cfg?.model ?? "-", hasKey: !!cfg?.apiKey };
  }));
  const noKey = ai.filter((a) => !a.hasKey);
  ext.push({ name: "AI", status: noKey.length === ai.length ? "fail" : noKey.length ? "warn" : "ok", href: "/admin/settings",
    detail: noKey.length ? `ยังไม่มีคีย์: ${noKey.map((a) => a.label).join(", ")}` : "ตั้งคีย์ครบทุกงาน (กดทดสอบด้านล่างเพื่อยิงจริง)" });
  groups.push({ title: "บริการภายนอก", checks: ext });

  // ---------- งานตั้งเวลา + error ----------
  const ops: HealthCheck[] = [];
  const { data: runs, error: runErr } = await admin.from("cron_runs").select("job, last_at, ok, note");
  for (const [job, label, maxH] of CRON_JOBS) {
    if (runErr) { ops.push({ name: `งานตั้งเวลา: ${label}`, status: "warn", detail: "ยังไม่ได้รัน 0058 — ยังไม่มีบันทึกการรัน" }); continue; }
    const r = (runs || []).find((x) => x.job === job) as { last_at: string; ok: boolean; note: string | null } | undefined;
    if (!r) {
      const detail = job === "schedule"
        ? "ยังไม่เคยรัน — รัน 0064 และเปิด extension pg_cron (ไม่มีฟอร์มที่ตั้งรอบตรวจ = ข้ามได้)"
        : env("CRON_SECRET") ? "ยังไม่เคยรัน (รอรอบแรกหลัง deploy)" : "ยังไม่เคยรัน — ตั้ง CRON_SECRET ก่อน";
      ops.push({ name: `งานตั้งเวลา: ${label}`, status: "warn", detail });
      continue;
    }
    const hours = (Date.now() - new Date(r.last_at).getTime()) / 3600_000;
    ops.push({
      name: `งานตั้งเวลา: ${label}`,
      status: !r.ok ? "fail" : hours > maxH ? "warn" : "ok",
      detail: `${!r.ok ? "รอบล่าสุดล้มเหลว" : hours > maxH ? (maxH < 1 ? `ไม่ได้รันเกิน ${Math.round(maxH * 60)} นาที` : `ไม่ได้รันเกิน ${maxH} ชั่วโมง`) : "รันปกติ"} · ล่าสุด ${hours < 1 ? `${Math.round(hours * 60)} นาที` : `${Math.round(hours)} ชม.`}ก่อน${!r.ok && r.note ? ` · ${r.note.slice(0, 160)}` : ""}`,
    });
  }
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count: errCount, error: errErr } = await admin.from("error_events").select("id", { head: true, count: "exact" }).gte("created_at", since);
  ops.push(errErr
    ? { name: "error 24 ชม.", status: "warn", detail: "ยังไม่มีตาราง error_events (0053)" }
    : { name: "error 24 ชม.", status: (errCount ?? 0) > 50 ? "fail" : (errCount ?? 0) > 0 ? "warn" : "ok", detail: `${errCount ?? 0} ครั้ง`, href: "/admin/errors" });
  groups.push({ title: "การทำงานของระบบ", checks: ops });

  return { groups, ai, stats, checkedAt: new Date().toISOString() };
}
