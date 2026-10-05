import { SERVER_MESSAGES_EN } from "@/i18n/server-messages";

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
  return SERVER_MESSAGES_EN[text.trim()] ?? localizeStored(text, lang);
}
