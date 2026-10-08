"use server";
// Studio › ปุ่มเปิดฟอร์มลูก: รายชื่อฟอร์มที่เลือกเป็นฟอร์มลูกได้ (เผยแพร่แล้ว · workspace เดียวกัน)
import { sm } from "@/lib/server-msg";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";
import { sanitizeSchema, type FieldType, type TableColType } from "@/lib/form-schema";

export interface ChildCandidate {
  id: string;
  title: string;
  icon: string;
  /** ฟอร์มนี้มีปุ่มฟอร์มลูกเอง — เลือกเป็นฟอร์มลูกไม่ได้ (ไม่ซ้อนเกิน 1 ชั้น) */
  nested: boolean;
  steps: { title: string; fields: { id: string; label: string; type: FieldType; columns?: { id: string; label: string; type: TableColType }[] }[] }[];
}

export async function listChildFormCandidates(): Promise<{ forms: ChildCandidate[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์") };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .select("id, title, icon, schema")
    .eq("tenant_id", session.tenantId)
    .eq("status", "published")
    .is("deleted_at", null)
    .order("title")
    .limit(300);
  if (error) return { error: await sm("โหลดรายชื่อฟอร์มไม่สำเร็จ") };
  const forms: ChildCandidate[] = [];
  for (const r of (data || []) as { id: string; title: string; icon: string; schema: unknown }[]) {
    try {
      const s = sanitizeSchema(r.schema);
      forms.push({
        id: r.id,
        title: r.title || "ฟอร์ม",
        icon: r.icon || "📋",
        nested: s.steps.some((st) => st.fields.some((f) => f.type === "child_form")),
        steps: s.steps.map((st) => ({
          title: st.title,
          fields: st.fields.map((f) => ({ id: f.id, label: f.label, type: f.type, ...(f.columns ? { columns: f.columns.map((c) => ({ id: c.id, label: c.label, type: c.type })) } : {}) })),
        })),
      });
    } catch { /* schema เสีย — ข้าม */ }
  }
  return { forms };
}
