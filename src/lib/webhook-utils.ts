// ยูทิลบริสุทธิ์สำหรับ webhook (ไม่มี side-effect / ไม่พึ่ง server) — แยกไว้เพื่อทดสอบได้
// ใช้โดย src/lib/webhooks.ts (ฝั่ง server)

/**
 * กรอง answers ให้เหลือเฉพาะฟิลด์ที่ webhook เลือกไว้
 * answers เรียงลำดับตรงกับ fieldIds (flatten steps) — คืนเฉพาะตัวที่ index ตรงกับ field ที่เลือก
 * ถ้าไม่ได้เลือกฟิลด์ หรือไม่มี field map → คืน answers เดิมทั้งหมด
 */
export function filterAnswersByFields(
  answers: unknown[],
  fieldIds: string[],
  keepFields: string[]
): unknown[] {
  if (!keepFields.length || !fieldIds.length) return answers;
  const keep = new Set(keepFields);
  return answers.filter((_, i) => keep.has(fieldIds[i]));
}
