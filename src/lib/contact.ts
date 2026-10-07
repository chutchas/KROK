// ============================================================
// ฟอร์ม "ติดต่อเรา" — ตรวจข้อมูล + เนื้อหาอีเมลถึงทีมขาย (ฟังก์ชันล้วน · ทดสอบได้)
// ============================================================

export interface ContactInput {
  name: string;
  company: string;
  email: string;
  phone: string;
  seats: string;
  message: string;
}

export type ContactField = keyof ContactInput;

/** อย่างน้อยกี่วินาทีหลังเปิดหน้าถึงจะรับ (บอทกรอกเร็วกว่าคน) */
export const CONTACT_MIN_MS = 3000;
export const SEAT_OPTIONS = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function cleanContact(raw: unknown): ContactInput {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const msg = typeof o.message === "string" ? o.message.replace(/\r\n/g, "\n").trim().slice(0, 4000) : "";
  const seats = str(o.seats, 40);
  return {
    name: str(o.name, 120),
    company: str(o.company, 160),
    email: str(o.email, 200).toLowerCase(),
    phone: str(o.phone, 40),
    seats: (SEAT_OPTIONS as readonly string[]).includes(seats) ? seats : "",
    message: msg,
  };
}

/** ช่องที่ผิด (ไม่มี = ผ่าน) */
export function contactErrors(c: ContactInput): ContactField[] {
  const bad: ContactField[] = [];
  if (!c.name) bad.push("name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email) || /[^\x21-\x7e]/.test(c.email)) bad.push("email");
  if (c.phone && !/^[0-9+\-\s()]{6,40}$/.test(c.phone)) bad.push("phone");
  if (c.message.length < 5) bad.push("message");
  return bad;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** อีเมลถึงทีมขาย (Reply-To = ลูกค้า) */
export function contactEmail(c: ContactInput, adminUrl: string) {
  const who = c.company ? `${c.name} (${c.company})` : c.name;
  const subject = `[KROK] ติดต่อจากเว็บไซต์: ${who}`.slice(0, 200);
  const rows: [string, string][] = [
    ["ชื่อ", c.name], ["บริษัท", c.company || "—"], ["อีเมล", c.email], ["โทร", c.phone || "—"], ["จำนวนผู้ใช้", c.seats || "—"],
  ];
  const text = [...rows.map(([k, v]) => `${k}: ${v}`), "", c.message, "", `ดูทั้งหมด: ${adminUrl}`, "ตอบกลับอีเมลนี้ = ตอบลูกค้าโดยตรง"].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:'Segoe UI',Tahoma,sans-serif;color:#1e293b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;padding:24px">
<tr><td style="font-size:18px;font-weight:700;color:#2563eb">KROK · ติดต่อจากเว็บไซต์</td></tr>
<tr><td style="padding-top:12px"><table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.7">
${rows.map(([k, v]) => `<tr><td style="color:#64748b;padding-right:14px;vertical-align:top">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join("")}
</table></td></tr>
<tr><td style="padding-top:14px;font-size:14px;line-height:1.7;white-space:pre-wrap;border-top:1px solid #e2e8f0;margin-top:12px">${esc(c.message)}</td></tr>
<tr><td style="padding-top:16px;font-size:12px;color:#94a3b8">กด "ตอบกลับ" = ตอบลูกค้าโดยตรง · ดูทั้งหมด: <a href="${esc(adminUrl)}">${esc(adminUrl)}</a></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
