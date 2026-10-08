// ฟอร์มลูก (0074): แถวที่ฟอร์มลูกเขียนกลับในตารางของใบหลัก
type Row = Record<string, unknown>;

/**
 * แถวจากฟอร์มลูกในคำตอบของงาน (ฐานข้อมูล) → { ตาราง id: แถว }
 * ส่งต่อให้ sanitizePublicAnswers(…, { childRows }) ซึ่งเป็นจุดเดียวที่ประกอบตารางของใบสุดท้าย
 * (แถวลูกจากเบราว์เซอร์ไม่ถูกใช้เลย — trigger form_cases_child_guard คุมแถวในฐานข้อมูล)
 */
export function childRowsFromCase(caseAnswers: Record<string, { value?: unknown }> | null | undefined): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  for (const [id, a] of Object.entries(caseAnswers || {})) {
    const v = a?.value;
    if (!Array.isArray(v)) continue;
    const rows = v.filter((r): r is Row => !!r && typeof r === "object" && !Array.isArray(r) && "_child" in r);
    if (rows.length) out[id] = rows;
  }
  return out;
}
