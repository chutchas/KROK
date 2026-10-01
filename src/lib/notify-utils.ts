// ยูทิลบริสุทธิ์ของการแจ้งเตือน (ไม่พึ่ง server) — แยกไว้เพื่อทดสอบได้

/** พอร์ต SMTP ที่อนุญาต (กันใช้ฟีเจอร์อีเมลสแกนพอร์ตอื่นของเครื่องปลายทาง) */
export const SMTP_PORTS = [25, 465, 587, 2525] as const;

export function smtpPortAllowed(port: unknown): port is number {
  return typeof port === "number" && (SMTP_PORTS as readonly number[]).includes(port);
}

/** ชื่อโฮสต์ SMTP ต้องเป็นโดเมนธรรมดา (ไม่ใช่ IP ตรง / localhost / มี path) */
export function smtpHostShapeOk(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h || h.length > 253) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return false; // IPv4/IPv6 ตรง ๆ
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h);
}

/**
 * แปลง error ของ nodemailer เป็นข้อความที่ปลอดภัยต่อการแสดง
 * ไม่ส่งข้อความดิบกลับ (อาจเผย IP/banner/สถานะพอร์ตของเครื่องปลายทาง)
 */
export function friendlySmtpError(e: unknown): string {
  const code = (e as { code?: string; responseCode?: number } | null)?.code || "";
  const rc = (e as { responseCode?: number } | null)?.responseCode;
  if (code === "EAUTH" || rc === 535 || rc === 534) return "เข้าสู่ระบบ SMTP ไม่ได้ — ตรวจชื่อผู้ใช้/รหัสผ่าน (Gmail ต้องใช้ App Password)";
  if (code === "EENVELOPE" || rc === 550 || rc === 553 || rc === 501) return "เซิร์ฟเวอร์ปฏิเสธที่อยู่ผู้ส่ง/ผู้รับ — ตรวจอีเมลผู้ส่งให้ตรงกับบัญชี SMTP";
  if (code === "ETLS" || code === "ESOCKET" && /certificate|tls|ssl/i.test(String((e as Error)?.message))) return "เชื่อมต่อแบบเข้ารหัสไม่สำเร็จ — ลองสลับพอร์ต 465 (SSL) / 587 (STARTTLS)";
  if (code === "ETIMEDOUT" || code === "ECONNECTION" || code === "ESOCKET" || code === "EDNS") return "เชื่อมต่อเซิร์ฟเวอร์ SMTP ไม่ได้ — ตรวจชื่อโฮสต์และพอร์ต";
  if (code === "EBLOCKED") return "ไม่อนุญาตให้ส่งผ่านเซิร์ฟเวอร์นี้ (ที่อยู่ภายในเครือข่าย)";
  return "ส่งอีเมลไม่สำเร็จ — ตรวจการตั้งค่า SMTP อีกครั้ง";
}

/** ผลของ webhook ถือว่าล้มเหลวไหม (ข้อความ last_status เช่น "200", "503 (attempt 3)", "test HTTP 404", "error: …") */
export function webhookStatusFailed(status: string | null | undefined): boolean {
  if (!status) return false;
  if (/error|fail/i.test(status)) return true;
  const m = status.match(/\b(\d{3})\b/);
  return !!m && (Number(m[1]) < 200 || Number(m[1]) >= 300);
}
