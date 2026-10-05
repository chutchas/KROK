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

// ข้อความ error จาก server ที่ผู้กรอกหน้างานเห็นบ่อย (server ตอบเป็นภาษาไทย) — แปลฝั่งหน้าจอเมื่อเลือกภาษาอังกฤษ
const SERVER_EN: Record<string, string> = {
  "ข้อมูลใหญ่เกินไป": "The data is too large",
  "ส่งถี่เกินไป โปรดลองใหม่อีกสักครู่": "Too many submissions — please try again shortly",
  "คุณไม่ได้เป็นสมาชิกของ workspace ที่กรอกใบนี้แล้ว": "You're no longer a member of the workspace this was filled in",
  "รหัสเอกสารซ้ำ": "Duplicate document ID",
  "ไม่พบฟอร์ม หรือไม่มีสิทธิ์กรอกฟอร์มนี้": "Form not found, or you don't have access to it",
  "ไม่พบงาน": "Task not found",
  "งานนี้ไม่ได้อยู่กับคุณแล้ว": "This task is no longer assigned to you",
  "ฟอร์มนี้ปิดรับข้อมูลแล้ว": "This form is no longer accepting responses",
  "ฟอร์มไม่ถูกต้อง": "The form is invalid",
  "เครื่องนี้ยังไม่ได้รับอนุมัติให้กรอกฟอร์มนี้": "This device isn't approved to fill this form",
  "เครื่องนี้ไม่ได้รับอนุญาตสำหรับฟอร์มนี้": "This device isn't allowed for this form",
  "อ่านไฟล์แนบไม่สำเร็จ โปรดลองใหม่": "Couldn't read the attached files — please try again",
  "บันทึกไม่สำเร็จ โปรดลองใหม่": "Couldn't save — please try again",
  "บันทึกรูปไม่สำเร็จ โปรดลองใหม่": "Couldn't save the photos — please try again",
  "กรุณาเข้าสู่ระบบ": "Please sign in",
  "ต้องระบุเหตุผลที่ส่งกลับ": "Please give a reason for sending it back",
  "ฟอร์มนี้ไม่เปิดให้กรอกแบบสาธารณะ": "This form isn't open to the public",
  "ส่งฟอร์มถี่เกินไป โปรดลองใหม่อีกสักครู่": "Too many submissions — please try again shortly",
  "มีการส่งฟอร์มถี่เกินไป โปรดลองใหม่อีกสักครู่": "Too many submissions — please try again shortly",
  "ฟอร์มนี้รับข้อมูลครบจำนวนของวันนี้แล้ว โปรดลองใหม่พรุ่งนี้": "This form has reached today's limit — please try again tomorrow",
  "เรียกใช้ AI ถี่เกินไป — รอสักครู่แล้วลองใหม่": "Too many AI requests — wait a moment and try again",
  "ชนิดไฟล์ไม่รองรับ": "Unsupported file type",
  "ไฟล์ใหญ่เกินไป (สูงสุด 8MB)": "File too large (max 8MB)",
  "ไฟล์ใหญ่เกิน 8MB": "File larger than 8MB",
  "unauthorized": "Please sign in",
};

export function localizeServerMsg(text: string | null | undefined, lang: string): string {
  if (text == null) return "";
  if (lang !== "en") return text;
  return SERVER_EN[text.trim()] ?? localizeStored(text, lang);
}
