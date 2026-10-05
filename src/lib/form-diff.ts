// ============================================================
// สรุปความต่างระหว่างฟอร์ม 2 เวอร์ชัน (ฟังก์ชันล้วน · ใช้ในหน้าประวัติเวอร์ชัน)
// จับคู่ช่องด้วย field id (เปลี่ยนชื่อช่อง = ช่องเดิมที่แก้ ไม่ใช่ลบ+เพิ่ม)
// ============================================================
import type { FormField, FormSchema } from "@/lib/form-schema";

export type DiffKind = "added" | "removed" | "label" | "type" | "required" | "options" | "limits" | "moved" | "formula";

export interface FieldChange {
  kind: DiffKind;
  id: string;
  label: string;
  /** ค่าก่อน/หลัง (เฉพาะที่อ่านรู้เรื่อง เช่น ชื่อช่อง ชนิด) */
  from?: string;
  to?: string;
}

export interface FormDiff {
  title?: { from: string; to: string };
  steps: { added: string[]; removed: string[]; renamed: { from: string; to: string }[] };
  fields: FieldChange[];
  /** เปลี่ยนส่วนอื่น (หน้ากระดาษ/ธีม/รูป/คำอธิบาย/ผู้รับผิดชอบขั้น/แหล่งเติมข้อมูล) */
  other: ("layout" | "theme" | "images" | "description" | "assignee" | "fill_sources" | "print" | "privacy" | "category" | "header")[];
  /** ไม่มีอะไรต่างเลย */
  same: boolean;
}

type Located = { f: FormField; step: number; stepTitle: string };

function index(s: FormSchema | null | undefined): Map<string, Located> {
  const m = new Map<string, Located>();
  (s?.steps || []).forEach((st, i) => (st.fields || []).forEach((f) => m.set(f.id, { f, step: i, stepTitle: st.title || "" })));
  return m;
}

const j = (v: unknown) => JSON.stringify(v ?? null);

export function diffForms(prev: FormSchema | null | undefined, next: FormSchema): FormDiff {
  const out: FormDiff = { steps: { added: [], removed: [], renamed: [] }, fields: [], other: [], same: false };
  if (!prev) {
    out.same = false;
    for (const [id, { f }] of index(next)) out.fields.push({ kind: "added", id, label: f.label });
    out.steps.added = (next.steps || []).map((s) => s.title || "");
    return out;
  }
  if ((prev.title || "") !== (next.title || "")) out.title = { from: prev.title || "", to: next.title || "" };

  const ps = new Map((prev.steps || []).map((s) => [s.id, s]));
  const ns = new Map((next.steps || []).map((s) => [s.id, s]));
  for (const [id, s] of ns) {
    const p = ps.get(id);
    if (!p) out.steps.added.push(s.title || "");
    else if ((p.title || "") !== (s.title || "")) out.steps.renamed.push({ from: p.title || "", to: s.title || "" });
  }
  for (const [id, s] of ps) if (!ns.has(id)) out.steps.removed.push(s.title || "");

  const pf = index(prev);
  const nf = index(next);
  for (const [id, n] of nf) {
    const p = pf.get(id);
    if (!p) { out.fields.push({ kind: "added", id, label: n.f.label }); continue; }
    const a = p.f, b = n.f;
    if ((a.label || "") !== (b.label || "")) out.fields.push({ kind: "label", id, label: b.label, from: a.label, to: b.label });
    if (a.type !== b.type) out.fields.push({ kind: "type", id, label: b.label, from: a.type, to: b.type });
    if (!!a.required !== !!b.required) out.fields.push({ kind: "required", id, label: b.label, from: String(!!a.required), to: String(!!b.required) });
    if (j(a.options) !== j(b.options) || j(a.options_source) !== j(b.options_source) || j(a.columns) !== j(b.columns))
      out.fields.push({ kind: "options", id, label: b.label });
    if (a.min !== b.min || a.max !== b.max || (a.unit || "") !== (b.unit || "")) out.fields.push({ kind: "limits", id, label: b.label });
    if ((a.formula || "") !== (b.formula || "")) out.fields.push({ kind: "formula", id, label: b.label });
    if (p.step !== n.step) out.fields.push({ kind: "moved", id, label: b.label, from: p.stepTitle, to: n.stepTitle });
  }
  for (const [id, p] of pf) if (!nf.has(id)) out.fields.push({ kind: "removed", id, label: p.f.label });

  if (j(prev.layout) !== j(next.layout)) out.other.push("layout");
  if (j(prev.theme) !== j(next.theme)) out.other.push("theme");
  if (j(prev.images) !== j(next.images)) out.other.push("images");
  if ((prev.description || "") !== (next.description || "")) out.other.push("description");
  if (j(prev.print_photos) !== j(next.print_photos)) out.other.push("print");
  if ((prev.privacy_notice || "") !== (next.privacy_notice || "")) out.other.push("privacy");
  if ((prev.category || "") !== (next.category || "")) out.other.push("category");
  if (j([prev.show_header, prev.show_meta, prev.icon]) !== j([next.show_header, next.show_meta, next.icon])) out.other.push("header");
  // ตั้งค่าของขั้นที่มีทั้งสองเวอร์ชัน (ขั้นที่เพิ่ม/ลบ แสดงแยกอยู่แล้ว)
  const stepChanged = (key: "assignee" | "fill_sources") =>
    (next.steps || []).some((x) => { const p = ps.get(x.id); return !!p && j(p[key] ?? null) !== j(x[key] ?? null); })
    || (next.steps || []).some((x) => !ps.has(x.id) && x[key] != null && (key !== "fill_sources" || (x.fill_sources?.length ?? 0) > 0));
  if (stepChanged("assignee")) out.other.push("assignee");
  if (stepChanged("fill_sources")) out.other.push("fill_sources");

  out.same = !out.title && !out.steps.added.length && !out.steps.removed.length && !out.steps.renamed.length && !out.fields.length && !out.other.length;
  return out;
}

/** นับสรุปสั้น ๆ สำหรับรายการ */
export function diffCounts(d: FormDiff): { added: number; removed: number; changed: number } {
  const changedIds = new Set(d.fields.filter((c) => c.kind !== "added" && c.kind !== "removed").map((c) => c.id));
  return {
    added: d.fields.filter((c) => c.kind === "added").length,
    removed: d.fields.filter((c) => c.kind === "removed").length,
    changed: changedIds.size,
  };
}
