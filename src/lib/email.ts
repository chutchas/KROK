// ============================================================
// KROK · ส่งอีเมลของระบบ (เช่น อีเมลเชิญสมาชิก) — เลือกช่องทางจาก env (ฝั่ง server เท่านั้น):
//
// ① Resend (มีโดเมนของตัวเอง)
//   RESEND_API_KEY = re_xxx
//   EMAIL_FROM     = "KROK <no-reply@โดเมนคุณ>"  (ไม่ตั้ง = onboarding@resend.dev ส่งได้เฉพาะถึงเจ้าของบัญชี Resend)
// ② SMTP (ไม่มีโดเมน — เช่น Gmail + App Password) ใช้เมื่อไม่ได้ตั้ง RESEND_API_KEY
//   SMTP_HOST = smtp.gmail.com · SMTP_PORT = 465 · SMTP_USER = xxx@gmail.com · SMTP_PASS = App Password 16 ตัว
//   EMAIL_FROM = "KROK <xxx@gmail.com>" (ไม่ตั้ง = KROK <SMTP_USER>) · Gmail ส่งได้ราว 500 ผู้รับ/วัน
// ไม่ได้ตั้งทั้งสองแบบ = ไม่ส่ง แต่ระบบยังทำงานต่อได้ (หน้าเชิญให้คัดลอกลิงก์ส่งเอง)
// อีเมลยืนยันการสมัคร/รีเซ็ตรหัสผ่าน ส่งโดย Supabase Auth — ตั้ง SMTP ใน Supabase แยกต่างหาก
// ============================================================
import nodemailer from "nodemailer";

export type SendResult = { ok: true; id: string } | { ok: false; error: string; notConfigured?: boolean };

function smtpEnv() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, ""); // App Password ของ Google แสดงเป็น 4 กลุ่มมีช่องว่าง
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT) || 465;
  return { host, user, pass, port };
}

/** ช่องทางที่ใช้ส่งอีเมลของระบบ */
export function emailProvider(): "resend" | "smtp" | null {
  if (process.env.RESEND_API_KEY) return "resend";
  if (smtpEnv()) return "smtp";
  return null;
}

export function emailConfigured(): boolean {
  return emailProvider() !== null;
}

type Msg = { to: string; subject: string; html: string; text: string; replyTo?: string };

async function sendSmtp(msg: Msg, cfg: NonNullable<ReturnType<typeof smtpEnv>>): Promise<SendResult> {
  try {
    const t = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.port === 465, auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 10_000, greetingTimeout: 8_000, socketTimeout: 15_000,
    });
    const info = await t.sendMail({
      from: process.env.EMAIL_FROM || `KROK <${cfg.user}>`, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    });
    return { ok: true, id: String(info.messageId || "smtp") };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    // ข้อความที่พบบ่อยของ Gmail → บอกวิธีแก้
    if (/535|Username and Password not accepted|BadCredentials/i.test(m)) return { ok: false, error: "SMTP ล็อกอินไม่ผ่าน — ตรวจ SMTP_USER และ SMTP_PASS (ต้องเป็น App Password ไม่ใช่รหัสผ่าน Gmail)" };
    if (/Daily user sending limit|550 5\.4\.5/i.test(m)) return { ok: false, error: "Gmail ส่งครบโควตาวันนี้แล้ว — ลองใหม่พรุ่งนี้" };
    return { ok: false, error: `ส่งอีเมลไม่สำเร็จ: ${m.slice(0, 160)}` };
  }
}

export async function sendEmail(msg: Msg): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    const smtp = smtpEnv();
    if (smtp) return sendSmtp(msg, smtp);
    return { ok: false, error: "ยังไม่ได้ตั้งค่าการส่งอีเมล (RESEND_API_KEY หรือ SMTP_*)", notConfigured: true };
  }
  const from = process.env.EMAIL_FROM || "KROK <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, ...(msg.replyTo ? { reply_to: msg.replyTo } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok || !j.id) return { ok: false, error: j.message || `Resend ตอบกลับ ${res.status}` };
    return { ok: true, id: j.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ส่งอีเมลไม่สำเร็จ" };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** อีเมลเชิญเข้าร่วม workspace (ไทย + อังกฤษ) */
export function inviteEmail(p: { workspace: string; inviter: string; role: string; teams: string[]; link: string }) {
  const teams = p.teams.length ? p.teams.join(", ") : "";
  const subject = `${p.inviter} เชิญคุณเข้าร่วม ${p.workspace} บน KROK`;
  const text = [
    `${p.inviter} เชิญคุณเข้าร่วม workspace "${p.workspace}" บน KROK`,
    `สิทธิ์: ${p.role}${teams ? ` · ทีม: ${teams}` : ""}`,
    "",
    `สมัคร/เข้าสู่ระบบด้วยอีเมลนี้เพื่อเข้าร่วม: ${p.link}`,
    "",
    `${p.inviter} invited you to join "${p.workspace}" on KROK. Sign up or sign in with this email: ${p.link}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:'Segoe UI',Tahoma,sans-serif;color:#1e293b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;padding:28px">
<tr><td style="font-size:20px;font-weight:700;color:#2563eb">KROK</td></tr>
<tr><td style="padding-top:14px;font-size:17px;font-weight:600">${esc(p.inviter)} เชิญคุณเข้าร่วม ${esc(p.workspace)}</td></tr>
<tr><td style="padding-top:8px;font-size:14px;color:#475569;line-height:1.6">สิทธิ์ที่จะได้รับ: <b>${esc(p.role)}</b>${teams ? `<br>ทีม/แผนก: <b>${esc(teams)}</b>` : ""}</td></tr>
<tr><td style="padding:22px 0"><a href="${esc(p.link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">เข้าร่วม workspace</a></td></tr>
<tr><td style="font-size:13px;color:#64748b;line-height:1.6">สมัครหรือเข้าสู่ระบบด้วยอีเมลที่ได้รับข้อความนี้ ระบบจะพาเข้า workspace ให้อัตโนมัติ<br>ถ้าปุ่มกดไม่ได้ คัดลอกลิงก์นี้: <span style="word-break:break-all">${esc(p.link)}</span></td></tr>
<tr><td style="padding-top:18px;border-top:1px solid #e2e8f0;margin-top:18px;font-size:12px;color:#94a3b8">${esc(p.inviter)} invited you to join ${esc(p.workspace)} on KROK. Sign up or sign in with this email to join. ถ้าคุณไม่รู้จักผู้เชิญ ไม่ต้องทำอะไร — ข้ามอีเมลนี้ได้เลย</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}
