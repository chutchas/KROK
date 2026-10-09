// ============================================================
// KROK · จับคู่คำตอบที่เก็บไว้ (submissions.answers) กับช่องใน schema
// ใช้วาด "เอกสาร A4" ของใบที่ส่งแล้วตามตำแหน่งบนกระดาษ (ตัวเดียวกับหน้ากรอกแบบกระดาษ)
//
// ใบใหม่เก็บ id ของช่องไว้ในคำตอบ → จับคู่ด้วย id (แม่นสุด, ชนิดต้องตรง)
// ใบเก่าไม่มี id → ลำดับเดียวกันและชื่อ+ชนิดตรง → ชื่อ+ชนิดตรง (ตัวแรกที่ยังไม่ถูกใช้)
// ไม่เจอ = ช่องนั้นว่างบนเอกสาร (เหมือนกระดาษที่ไม่ได้กรอก)
// ============================================================
import { isUiOnlyField, type FormSchema } from "@/lib/form-schema";
import type { AnswerItem } from "@/lib/answer-item";

export type StoredAnswer = AnswerItem & { id?: string };

export function matchAnswersToFields(schema: Pick<FormSchema, "steps">, answers: StoredAnswer[]): Record<string, StoredAnswer> {
  const fields = (schema.steps || []).flatMap((s) => s.fields || []).filter((f) => !isUiOnlyField(f));
  const used = new Set<number>();
  const out: Record<string, StoredAnswer> = {};
  const take = (k: number) => { used.add(k); return answers[k]; };
  fields.forEach((f, i) => {
    let k = answers.findIndex((a, j) => !used.has(j) && a?.id === f.id && a.type === f.type);
    if (k < 0 && answers[i] && !used.has(i) && !answers[i].id && answers[i].label === f.label && answers[i].type === f.type) k = i;
    if (k < 0) k = answers.findIndex((a, j) => !used.has(j) && a && !a.id && a.label === f.label && a.type === f.type);
    if (k >= 0) out[f.id] = take(k);
  });
  return out;
}
