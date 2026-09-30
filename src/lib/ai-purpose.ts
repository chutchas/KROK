// ============================================================
// KROK · purpose ของงาน AI
// แยกไว้ต่างหากจาก lib/ai.ts (server-only) เพราะ plans/หน้าจอฝั่ง client ต้องใช้ด้วย
//
// แต่ละ purpose ตั้ง provider/model/API key แยกกันได้ที่ Platform → AI
// เพราะความฉลาดที่ต้องใช้และปริมาณการเรียกต่างกันมาก
// ============================================================

export const AI_PURPOSES = ["form_gen", "form_from_image", "photo_check", "doc_extract"] as const;
export type AiPurpose = (typeof AI_PURPOSES)[number];

/** purpose ที่ต้องใช้โมเดลแบบ vision — ใช้ตอนทดสอบคีย์ในหน้า admin */
export const PURPOSE_NEEDS_VISION: Record<AiPurpose, boolean> = {
  form_gen: false,
  form_from_image: true,
  photo_check: true,
  doc_extract: true,
};

export const PURPOSE_LABELS: Record<AiPurpose, string> = {
  form_gen: "สร้าง/แก้ฟอร์มด้วย AI",
  form_from_image: "สร้างฟอร์มจากรูปฟอร์มเดิม",
  photo_check: "ตรวจรูปหน้างาน",
  doc_extract: "ดึงข้อมูลจากเอกสาร",
};

export const PURPOSE_LABELS_EN: Record<AiPurpose, string> = {
  form_gen: "Generate / refine form",
  form_from_image: "Form from image",
  photo_check: "On-site photo check",
  doc_extract: "Document extraction",
};

/** คำอธิบายสั้น ๆ ว่าควรตั้งรุ่นแบบไหน (แสดงในหน้า admin) */
export const PURPOSE_HINTS: Record<AiPurpose, string> = {
  form_gen: "ปริมาณต่ำ ไม่ต้องใช้ vision — เลือกรุ่นฉลาดได้",
  form_from_image: "ปริมาณต่ำ ต้องใช้ vision — เลือกรุ่นฉลาด",
  photo_check: "ปริมาณสูงมาก ต้องใช้ vision — เลือกรุ่นถูกและเร็ว",
  doc_extract: "ปริมาณสูงมาก ต้องใช้ vision + OCR ภาษาไทยแม่น",
};

export function isAiPurpose(v: unknown): v is AiPurpose {
  return typeof v === "string" && (AI_PURPOSES as readonly string[]).includes(v);
}
