// ข้อความ error ของโควตาแพ็กเกจ (ใช้ได้ทั้ง client/server)
// DB trigger ใช้รูปแบบเดียวกัน: "<ข้อความ> — อัปเกรดแพ็กเกจเพื่อเพิ่มโควตา [quota:<ชื่อ>]"

export const QUOTA_TAG_RE = /\s*\[quota:([a-z_]+)\]\s*$/;

export function quotaError(msg: string): string {
  return `${msg} — อัปเกรดแพ็กเกจที่หน้า “แพ็กเกจ/โควตา” เพื่อเพิ่มโควตา`;
}

/** เป็น error จากโควตาแพ็กเกจไหม (ไม่ควรเข้าคิวออฟไลน์ลองใหม่) */
export function isQuotaError(e: unknown): boolean {
  const m = typeof e === "string" ? e : (e as { message?: unknown } | null)?.message;
  return typeof m === "string" && /\[quota:[a-z_]+\]/.test(m);
}

/** ตัดแท็กเทคนิคออกก่อนแสดงผู้ใช้ */
export function cleanQuotaMessage(msg: string): string {
  return msg.replace(QUOTA_TAG_RE, "");
}

/** เวลา ISO ย้อนหลัง n วันจากตอนนี้ (ใช้กรองช่วงเก็บประวัติตามแพ็กเกจ) */
export function daysAgoIso(days: number, now = Date.now()): string {
  return new Date(now - days * 86400_000).toISOString();
}
