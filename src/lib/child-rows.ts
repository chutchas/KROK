// ฟอร์มลูก (0074): แถวที่ฟอร์มลูกเขียนกลับในตารางของใบหลัก
import type { FormSchema } from "@/lib/form-schema";

type Row = Record<string, unknown>;

/**
 * แถวจากฟอร์มลูกในใบสุดท้าย: ใช้ของฐานข้อมูลเท่านั้น (เบราว์เซอร์แก้/ปลอมไม่ได้)
 * source_only = ตารางนั้นมีเฉพาะแถวจากฟอร์มลูก · อื่น ๆ = แถวที่คนคีย์ + แถวจากฟอร์มลูก
 *
 * ทำกับคำตอบดิบ "ก่อน" sanitizePublicAnswers — แถวลูกจึงผ่านการแปลงค่าเดียวกับแถวที่คีย์เอง
 * (ผ่าน/ไม่ผ่าน → ข้อความ + นับเป็นข้อบกพร่องของใบหลัก, ติ๊ก → "ใช่")
 */
export function mergeChildRows(schema: FormSchema, raw: unknown, caseAnswers: Record<string, { value?: unknown }>): unknown[] {
  const list: unknown[] = Array.isArray(raw) ? raw.map((a) => (a && typeof a === "object" ? { ...(a as Row) } : a)) : [];
  const childTables = new Map<string, boolean>();
  for (const st of schema.steps)
    for (const f of st.fields)
      if (f.type === "child_form" && f.child_form?.table_id)
        childTables.set(f.child_form.table_id, (childTables.get(f.child_form.table_id) ?? false) || f.child_form.source_only);
  const tables = new Map(schema.steps.flatMap((s) => s.fields).filter((f) => f.type === "table").map((f) => [f.id, f]));

  for (const a of list) {
    if (!a || typeof a !== "object") continue;
    const item = a as Row;
    if (!Array.isArray(item.rows)) continue;
    const rows = (item.rows as unknown[]).filter((r): r is Row => !!r && typeof r === "object" && !Array.isArray(r));
    const id = String(item.id ?? "");
    // แถวที่อ้างว่ามาจากฟอร์มลูกจากเบราว์เซอร์ = ไม่เชื่อ
    const manual = childTables.get(id) ? [] : rows.filter((r) => !("_child" in r));
    item.rows = childTables.has(id) ? [...manual, ...dbChildRows(caseAnswers, id)] : manual;
  }
  // หน้ากรอกไม่ได้ส่งตารางมา (เช่น ซ่อนอยู่) แต่มีผลจากฟอร์มลูก → ยังต้องอยู่ในเอกสาร
  for (const id of childTables.keys()) {
    const f = tables.get(id);
    if (!f || list.some((a) => a && typeof a === "object" && (a as Row).id === id)) continue;
    const rows = dbChildRows(caseAnswers, id);
    if (rows.length) list.push({ id, label: f.label, type: "table", rows });
  }
  return list;
}

function dbChildRows(caseAnswers: Record<string, { value?: unknown }>, id: string): Row[] {
  const v = caseAnswers[id]?.value;
  return (Array.isArray(v) ? v : []).filter((r): r is Row => !!r && typeof r === "object" && "_child" in (r as object));
}
