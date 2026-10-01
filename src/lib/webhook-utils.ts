// ยูทิลบริสุทธิ์สำหรับ webhook (ไม่มี side-effect / ไม่พึ่ง server) — แยกไว้เพื่อทดสอบได้
// ใช้โดย src/lib/webhooks.ts (ฝั่ง server)

/**
 * กรอง answers ให้เหลือเฉพาะฟิลด์ที่ webhook เลือกไว้
 * คำตอบมี id → กรองตาม id · ข้อมูลเก่าไม่มี id → answers เรียงลำดับตรงกับ fieldIds (flatten steps) จับคู่ตาม index
 * ถ้าไม่ได้เลือกฟิลด์ หรือไม่มี field map → คืน answers เดิมทั้งหมด
 */
export function filterAnswersByFields(
  answers: unknown[],
  fieldIds: string[],
  keepFields: string[]
): unknown[] {
  if (!keepFields.length) return answers;
  const keep = new Set(keepFields);
  // คำตอบที่มี id ในตัว (ตั้งแต่ r29) → กรองด้วย id ตรง ๆ
  const idOf = (a: unknown) => (a && typeof a === "object" && typeof (a as { id?: unknown }).id === "string" ? (a as { id: string }).id : null);
  if (answers.some((a) => idOf(a) !== null)) return answers.filter((a) => { const id = idOf(a); return id !== null && keep.has(id); });
  if (!fieldIds.length) return answers;
  return answers.filter((_, i) => keep.has(fieldIds[i]));
}
