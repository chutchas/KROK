import "server-only";
import nodemailer from "nodemailer";
import { getAdminClient } from "@/lib/supabase/admin";

export type NotifyEvent = "submission.created" | "submission.approved" | "submission.rejected" | "case.assigned" | "case.returned";

export interface NotifyConfig {
  line_enabled: boolean;
  line_token: string | null;
  line_target: string | null;
  email_enabled: boolean;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  email_from: string | null;
  email_to: string[];
  on_created: boolean;
  on_approved: boolean;
  on_rejected: boolean;
  fail_only: boolean;
  /** งานส่งต่อ/ส่งกลับ (ฟอร์มกรอกหลายคน) — ไม่มีคอลัมน์ (ยังไม่รัน 0033) = แจ้ง */
  on_case?: boolean;
}

export interface NotifyInfo {
  formTitle: string;
  formIcon?: string;
  userName?: string;
  result?: "pass" | "fail";
  failCount?: number;
  submissionId: string;
  reviewer?: string;
  note?: string;
  appUrl?: string; // ลิงก์ไปหน้ารายละเอียด (ถ้ามี)
  /** งาน: ขั้นที่ต้องทำต่อ / ทีมที่ต้องรับ / คนที่ต้องแก้ */
  stepTitle?: string;
  teamName?: string;
  assignee?: string;
  caseTitle?: string;
}

const LINE_PUSH = "https://api.line.me/v2/bot/message/push";
const LINE_BROADCAST = "https://api.line.me/v2/bot/message/broadcast";

/** ส่งข้อความ LINE ผ่าน Messaging API (push ถ้ามี target, ไม่งั้น broadcast) */
export async function sendLine(token: string, target: string | null, text: string): Promise<{ ok: boolean; status: string }> {
  try {
    const body = target
      ? JSON.stringify({ to: target, messages: [{ type: "text", text }] })
      : JSON.stringify({ messages: [{ type: "text", text }] });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(target ? LINE_PUSH : LINE_BROADCAST, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) return { ok: true, status: "OK" };
    const t = await res.text().catch(() => "");
    return { ok: false, status: `HTTP ${res.status} ${t.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, status: e instanceof Error ? e.message.slice(0, 120) : "failed" };
  }
}

interface SmtpCfg {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string[];
}

/** ส่งอีเมลผ่าน SMTP ของ tenant */
export async function sendEmail(cfg: SmtpCfg, subject: string, text: string): Promise<{ ok: boolean; status: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465, // 465 = SSL, อื่น ๆ ใช้ STARTTLS
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 10000,
      greetingTimeout: 8000,
    });
    await transporter.sendMail({
      from: cfg.from,
      to: cfg.to.join(", "),
      subject,
      text,
    });
    return { ok: true, status: "OK" };
  } catch (e) {
    return { ok: false, status: e instanceof Error ? e.message.slice(0, 160) : "failed" };
  }
}

function eventLabel(ev: NotifyEvent): string {
  if (ev === "submission.approved") return "อนุมัติแล้ว";
  if (ev === "submission.rejected") return "ถูกตีกลับ";
  if (ev === "case.assigned") return "มีงานรอรับ";
  if (ev === "case.returned") return "งานถูกส่งกลับให้แก้ไข";
  return "มีการส่งฟอร์มใหม่";
}

function buildMessage(ev: NotifyEvent, info: NotifyInfo): { subject: string; text: string } {
  const head = eventLabel(ev);
  const lines = [
    `[KROK] ${head}`,
    `ฟอร์ม: ${info.formIcon ? info.formIcon + " " : ""}${info.formTitle}`,
  ];
  const isCase = ev === "case.assigned" || ev === "case.returned";
  if (isCase && info.caseTitle) lines.push(`งาน: ${info.caseTitle}`);
  if (isCase && info.stepTitle) lines.push(`ขั้นที่ต้องทำ: ${info.stepTitle}`);
  if (isCase && info.teamName) lines.push(`ทีม: ${info.teamName}`);
  if (isCase && info.assignee) lines.push(`ผู้รับผิดชอบ: ${info.assignee}`);
  if (info.userName) lines.push(`${isCase ? (ev === "case.returned" ? "ส่งกลับโดย" : "ส่งต่อโดย") : "ผู้กรอก"}: ${info.userName}`);
  if (ev === "submission.created" && info.result) {
    lines.push(`ผล: ${info.result === "fail" ? `ไม่ผ่าน (${info.failCount ?? 0} รายการ)` : "ครบถ้วน"}`);
  }
  if (info.reviewer) lines.push(`ผู้ตรวจ: ${info.reviewer}`);
  if (info.note) lines.push(`หมายเหตุ: ${info.note}`);
  lines.push(`${isCase ? "เลขที่งาน" : "เลขที่"}: ${info.submissionId.slice(0, 8).toUpperCase()}`);
  if (info.appUrl) lines.push(info.appUrl);
  const text = lines.join("\n");
  return { subject: `[KROK] ${head} — ${info.formTitle}`, text };
}

function wanted(cfg: NotifyConfig, ev: NotifyEvent): boolean {
  if (ev === "submission.created") return cfg.on_created;
  if (ev === "submission.approved") return cfg.on_approved;
  if (ev === "submission.rejected") return cfg.on_rejected;
  if (ev === "case.assigned" || ev === "case.returned") return cfg.on_case !== false;
  return false;
}

/**
 * ส่งแจ้งเตือน LINE + Email ตามการตั้งค่าของ tenant (best-effort)
 * เรียกคู่กับ dispatchWebhooks ในจุดที่มี submission ใหม่/อนุมัติ/ตีกลับ
 * ผู้เรียกต้องยืนยันสิทธิ์ของ tenant มาก่อน (ใช้ service role อ่าน config)
 */
export async function dispatchNotifications(tenantId: string, ev: NotifyEvent, info: NotifyInfo): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;

  const { data } = await admin.from("tenant_notify").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (!data) return;
  const cfg = data as NotifyConfig;

  if (!wanted(cfg, ev)) return;
  // fail_only ใช้กับ submission.created เท่านั้น
  if (ev === "submission.created" && cfg.fail_only && info.result !== "fail") return;

  const { subject, text } = buildMessage(ev, info);
  const jobs: Promise<unknown>[] = [];

  if (cfg.line_enabled && cfg.line_token) {
    jobs.push(sendLine(cfg.line_token, cfg.line_target || null, text));
  }
  if (cfg.email_enabled && cfg.smtp_host && cfg.smtp_port && cfg.email_from && cfg.email_to.length) {
    jobs.push(
      sendEmail(
        {
          host: cfg.smtp_host,
          port: cfg.smtp_port,
          user: cfg.smtp_user || "",
          pass: cfg.smtp_pass || "",
          from: cfg.email_from,
          to: cfg.email_to,
        },
        subject,
        text
      )
    );
  }
  await Promise.allSettled(jobs);
}
