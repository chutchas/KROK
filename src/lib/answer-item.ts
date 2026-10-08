// ============================================================
// KROK · รูปแบบคำตอบที่เก็บใน submissions.answers
// แหล่งเดียวของความจริง — เดิมประกาศซ้ำอยู่ 4 ที่ (dashboard / submission / pdf / fill)
// ============================================================

/**
 * ที่มาของค่าในฟิลด์หนึ่ง (ไม่มีค่านี้ = คนกรอกเอง)
 *   scan      = ถอดรหัสจากบาร์โค้ด/QR บนเครื่องผู้ใช้ — แม่นตามมาตรฐาน ไม่ใช้ AI
 *   ai        = AI อ่านจากเอกสาร แล้วคนหน้างานยืนยันตามที่อ่านได้
 *   ai_edited = AI อ่านมาแล้วคนหน้างานแก้ก่อนยืนยัน (ใช้วัดความแม่นของ extraction)
 *
 * แยกไว้เพื่อให้ตรวจสอบย้อนหลังได้ว่าค่าไหนคนกรอกเอง ค่าไหนเครื่องช่วยเติม
 */
export type AnswerSrc = "scan" | "ai" | "ai_edited" | "api";

export interface AnswerItem {
  label: string;
  type: string;
  display?: string;
  note?: string;
  fail?: boolean;
  photoField?: string;
  /** ฟิลด์รูปหลายรูป: key ของทุกรูปตามลำดับ (รูปแรก = photoField) */
  photoFields?: string[];
  /** ชื่อใต้รูปของแต่ละรูป (ตรงกับ photoFields / photoField) — ไม่มี = ไม่ได้ตั้ง */
  photoLabels?: string[];
  rows?: Record<string, string>[];
  columns?: { id: string; label: string; type?: string }[];
  src?: AnswerSrc;
  /**
   * รหัสของตัวเลือกจากข้อมูลอ้างอิงที่ "แสดงชื่อ เก็บรหัส"
   * display = ชื่อที่ผู้กรอกเห็น · code = ค่าที่ใช้เชื่อมกับระบบอื่น (เลือกหลายข้อ = คั่นด้วย ", ")
   * คอลัมน์ select ในตาราง: เก็บเป็น rows[i]["<colId>#code"]
   */
  code?: string;
  /** คำตอบของฟิลด์พื้นที่ (รหัสพื้นที่อยู่ใน code) */
  area?: true;
}

/** key ของรหัสในแถวตาราง */
export const tableCodeKey = (colId: string) => `${colId}#code`;

export const SRC_LABEL: Record<AnswerSrc, string> = {
  scan: "สแกน",
  ai: "AI อ่าน",
  ai_edited: "AI อ่าน · แก้แล้ว",
  api: "ระบบภายนอก",
};
