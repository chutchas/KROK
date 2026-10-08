// ฟอร์มลูก (0074): แถวที่ฟอร์มลูกเขียนกลับในตารางของใบหลัก
import type { FormSchema } from "@/lib/form-schema";
import { CHILD_ROW_KEYS } from "@/lib/public-answers";

/**
 * แถวจากฟอร์มลูกในใบสุดท้าย: ใช้ของฐานข้อมูลเท่านั้น (เบราว์เซอร์แก้/ปลอมไม่ได้)
 * source_only = ตารางนั้นมีเฉพาะแถวจากฟอร์มลูก · อื่น ๆ = แถวที่คนคีย์ + แถวจากฟอร์มลูก
 */
export function applyChildRows(schema: FormSchema, answers: Record<string, unknown>[], caseAnswers: Record<string, { value?: unknown }>) {
  const childTables = new Map<string, boolean>();
  for (const st of schema.steps)
    for (const f of st.fields)
      if (f.type === "child_form" && f.child_form?.table_id)
        childTables.set(f.child_form.table_id, (childTables.get(f.child_form.table_id) ?? false) || f.child_form.source_only);
  for (const a of answers) {
    if (!Array.isArray(a.rows)) continue;
    const rows = a.rows as Record<string, string>[];
    const id = String(a.id ?? "");
    if (!childTables.has(id)) {
      for (const r of rows) for (const k of CHILD_ROW_KEYS) delete r[k];
      continue;
    }
    const dbVal = caseAnswers[id]?.value;
    const fromDb = (Array.isArray(dbVal) ? dbVal : []).filter(
      (r): r is Record<string, string> => !!r && typeof r === "object" && "_child" in (r as object)
    );
    const manual = childTables.get(id) ? [] : rows.filter((r) => !("_child" in r));
    a.rows = [...manual, ...fromDb];
    a.display = `${(a.rows as unknown[]).length} แถว`;
  }
}
