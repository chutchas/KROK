// ผู้อนุมัติหนึ่งขั้นใน approval chain
export interface ApprovalStep {
  user_id: string;
  name: string;
  label: string; // เช่น "หัวหน้ากะ", "QA", "ผู้จัดการ"
}

export interface ApprovalHistoryEntry {
  step: number;
  label: string;
  reviewer_name: string;
  decision: "approved" | "rejected";
  note: string;
  at: string;
}

export function sanitizeChain(raw: unknown): ApprovalStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s === "object")
    .map((s) => {
      const o = s as Record<string, unknown>;
      return {
        user_id: String(o.user_id || ""),
        name: String(o.name || "").slice(0, 120),
        label: String(o.label || "").slice(0, 60),
      };
    })
    .filter((s) => s.user_id)
    .slice(0, 6);
}
