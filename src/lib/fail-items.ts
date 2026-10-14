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

/** ประวัติปิด/เปิดเรื่อง (0081: submissions.fail_close_history) → รูปที่หน้าจอใช้ · ข้อมูลผิดรูปถูกข้าม */
export function historyOf(raw: unknown): { action: "close" | "reopen"; at: string; byName: string; note?: string; reason?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    const r = (e || {}) as Record<string, unknown>;
    if ((r.action !== "close" && r.action !== "reopen") || typeof r.at !== "string") return [];
    return [{
      action: r.action,
      at: r.at,
      byName: typeof r.by_name === "string" ? r.by_name : "",
      note: typeof r.note === "string" && r.note ? r.note : undefined,
      reason: typeof r.reason === "string" && r.reason ? r.reason : undefined,
    }];
  });
}

/** ค้างมากี่วัน (นับวันตามเวลาไทย · วันนี้ = 0) */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const day = (d: Date) => Date.parse(d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }));
  const n = Math.round((day(new Date()) - day(new Date(iso))) / 86_400_000);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
