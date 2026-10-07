// ตารางแปลข้อความจาก server (~27KB) โหลดแยกเมื่อเลือกภาษาอังกฤษเท่านั้น (LanguageProvider เรียก loadServerMessagesEn)
let serverEn: Record<string, string> | null = null;
let serverEnLoading: Promise<void> | null = null;
export function loadServerMessagesEn(): Promise<void> {
  serverEnLoading ??= import("@/i18n/server-messages").then((m) => { serverEn = m.SERVER_MESSAGES_EN; }).catch(() => { serverEnLoading = null; });
  return serverEnLoading;
}

// ============================================================
// ข้อความที่ระบบบันทึกลงผลการส่ง (เป็นภาษาไทยเสมอ — รายงาน/PDF/ข้อมูลเดิมอ้างรูปแบบนี้อยู่)
// แปลตอนแสดงผลเมื่อผู้ใช้เลือกภาษาอังกฤษ — ไม่แก้ข้อมูลที่เก็บ
// ============================================================

const RULES: [RegExp, string][] = [
  [/^เซ็นแล้ว — /, "Signed — "],
  [/^เซ็นแล้ว$/, "Signed"],
  [/^(\d+) รูป$/, "$1 photos"],
  [/^(\d+) แถว$/, "$1 rows"],
  [/^ไม่ได้เลือก: /, "Not selected: "],
  [/ \(ค่านอกช่วง\)$/, " (out of range)"],
  [/ แถว (\d+): /, " row $1: "],
  [/^ผ่าน$/, "Pass"],
  [/^ไม่ผ่าน$/, "Fail"],
  [/^ควรตรวจสอบ$/, "Needs review"],
  [/^ตรวจไม่ได้$/, "Couldn't check"],
  // แจ้งเตือนรอบตรวจตามตาราง (0064)
  [/^ถึงรอบตรวจ: /, "Inspection round started: "],
  [/^เลยกำหนดรอบตรวจ: /, "Inspection round overdue: "],
  [/^ครบกำหนดเมื่อ (\S+) น\. — ยังทำได้ \(นับว่าสาย\)$/, "Was due at $1 — you can still do it (counted as late)"],
  [/^ครบกำหนด (\S+) น\.$/, "Due at $1"],
  [/^ยังไม่ทำ (\d+) จาก (\d+) คน$/, "$1 of $2 people haven't done it"],
  [/^ยังไม่มีใครทำรอบนี้$/, "No one has done this round yet"],
];

export function localizeStored(text: string | null | undefined, lang: string): string {
  if (text == null) return "";
  if (lang !== "en") return text;
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
}

export function localizeServerMsg(text: string | null | undefined, lang: string): string {
  if (text == null) return "";
  if (lang !== "en") return text;
  if (!serverEn) void loadServerMessagesEn(); // ยังไม่โหลด = ใช้กฎแปลพื้นฐานไปก่อน
  return serverEn?.[text.trim()] ?? localizeStored(text, lang);
}
