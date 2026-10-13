import type { AnswerItem } from "@/lib/answer-item";

/**
 * ข้อที่ไม่ผ่านของใบ — จากคำตอบที่ติดธง fail (มีหมายเหตุของผู้ตรวจ) · ไม่มี = ใช้รายชื่อใน submissions.fails
 * ใช้ทั้งแผงปิดเรื่องในหน้าเอกสาร และบันทึกการปิดเรื่องบนหน้าพิมพ์/PDF
 */
export function failItemsOf(answers: unknown, fails: unknown): { label: string; note?: string }[] {
  const list = Array.isArray(answers) ? (answers as AnswerItem[]) : [];
  const flagged = list.filter((a) => a && a.fail).map((a) => ({ label: String(a.label || ""), note: a.note?.trim() || undefined }));
  if (flagged.length) return flagged;
  return (Array.isArray(fails) ? fails : []).map((f) => ({ label: String(f) }));
}
