// ============================================================
// KROK · กรองคำตอบของฟอร์มสาธารณะ (ผู้กรอกไม่ล็อกอิน) ฝั่ง server
//
// หน้ากรอกสร้างรายการคำตอบเอง (เหมือนผู้ใช้ที่ล็อกอิน) แต่ /api/public/submit เปิดให้ใครก็ยิงได้
// → ไม่เชื่อ payload ตรง ๆ: จับคู่กับช่องใน schema ตามลำดับ, เก็บเฉพาะ property ที่รู้จัก, ตัดความยาว,
//   และคำนวณ "ไม่ผ่าน" + ผลรวมใหม่จาก schema (client ส่ง result/fails มาก็ไม่ใช้)
// ============================================================
import type { FormField, FormSchema } from "@/lib/form-schema";
import { tableCodeKey } from "@/lib/answer-item";
import { computeFormulas, formatNumber, outOfRange } from "@/lib/formula";
import { finalizeTableRows, rowPhotoKeyOf } from "@/lib/table-rows";
import { allPhotoSlotKeys } from "@/lib/photo-slots";

const SRC = new Set(["scan", "ai", "ai_edited"]);
const str = (v: unknown, max: number): string | undefined => (typeof v === "string" ? v.slice(0, max) : undefined);

function cleanRows(f: FormField, raw: unknown): Record<string, string>[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>();
  for (const c of f.columns || []) { allowed.add(c.id); allowed.add(tableCodeKey(c.id)); if (c.type === "photo") allowed.add(rowPhotoKeyOf(c.id)); }
  const out: Record<string, string>[] = [];
  for (const r of raw.slice(0, 500)) {
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
      if (!allowed.has(k)) continue;
      const s = typeof v === "number" ? String(v) : str(v, 1000);
      if (s != null && s !== "") row[k] = s;
    }
    if (Object.keys(row).length) out.push(row);
  }
  return out;
}

export function sanitizePublicAnswers(
  schema: FormSchema,
  raw: unknown,
  /** field id ที่มีไฟล์รูป/ลายเซ็นแนบมาจริงในคำขอนี้ */
  uploaded: Set<string>
): { answers: Record<string, unknown>[]; fails: string[]; result: "pass" | "fail" } {
  const list = Array.isArray(raw) ? raw.slice(0, 500) : [];
  const fields = schema.steps.flatMap((s) => s.fields);
  const used = new Set<number>();
  const pick = (f: FormField, i: number): Record<string, unknown> | null => {
    const at = list[i] as Record<string, unknown> | undefined;
    if (at && typeof at === "object" && at.label === f.label && at.type === f.type && !used.has(i)) { used.add(i); return at; }
    const j = list.findIndex((x, k) => !used.has(k) && x && typeof x === "object" && (x as Record<string, unknown>).label === f.label && (x as Record<string, unknown>).type === f.type);
    if (j < 0) return null;
    used.add(j);
    return list[j] as Record<string, unknown>;
  };

  const answers: Record<string, unknown>[] = [];
  const fails: string[] = [];
  fields.forEach((f, i) => {
    const a = pick(f, i) || {};
    const item: Record<string, unknown> = { id: f.id, label: f.label, type: f.type };
    const src = str(a.src, 20);
    if (src && SRC.has(src)) item.src = src;

    if (f.type === "photo") {
      // หลายรูป: เก็บเฉพาะช่องที่มีไฟล์แนบมาจริง ตามลำดับช่อง
      const keys = allPhotoSlotKeys(f).filter((k) => uploaded.has(k));
      if (keys.length) {
        item.photoField = keys[0];
        if (keys.length > 1) item.photoFields = keys;
        item.display = str(a.display, 500) ?? "—";
      } else item.display = "—";
    } else if (f.type === "signature") {
      if (uploaded.has(f.id)) { item.photoField = f.id; item.display = "เซ็นแล้ว"; }
      else item.display = "—";
    } else if (f.type === "pass_fail") {
      const d = str(a.display, 20);
      const isFail = d === "ไม่ผ่าน" || a.fail === true;
      item.display = isFail ? "ไม่ผ่าน" : d === "ผ่าน" ? "ผ่าน" : "—";
      if (isFail) { item.fail = true; item.note = str(a.note, 1000) ?? ""; fails.push(f.label); }
    } else if (f.type === "number") {
      const d = str(a.display, 100) ?? "—";
      item.display = d;
      const v = parseFloat(d);
      if (Number.isFinite(v) && ((f.min != null && v < f.min) || (f.max != null && v > f.max))) { item.fail = true; fails.push(f.label + " (ค่านอกช่วง)"); }
    } else if (f.type === "formula") {
      // คำนวณใหม่หลังวนครบทุกช่อง (ด้านล่าง) — ไม่เชื่อค่าที่ client ส่งมา
      item.display = "—";
    } else if (f.type === "table") {
      // คอลัมน์สูตร/ผ่าน-ไม่ผ่าน คำนวณใหม่จากค่าที่กรอก · แถวที่ไม่ผ่าน = เอกสารไม่ผ่าน
      const fin = finalizeTableRows(f, cleanRows(f, a.rows), (k) => uploaded.has(k));
      item.rows = fin.rows;
      item.columns = (f.columns || []).map((c) => ({ id: c.id, label: c.label, type: c.type }));
      item.display = `${fin.rows.length} แถว`;
      if (fin.fails.length) { item.fail = true; fails.push(...fin.fails); }
    } else {
      item.display = str(a.display, 5000) ?? "—";
      const code = str(a.code, 1000);
      if (code && (f.type === "select" || f.type === "checkbox")) item.code = code;
      const note = str(a.note, 1000);
      if (note && f.type === "checkbox") item.note = note;
    }
    answers.push(item);
  });

  // ฟิลด์สูตร: คำนวณจากตัวเลข/ตารางที่ผ่านการกรองแล้วข้างบน
  if (fields.some((f) => f.type === "formula")) {
    const byId = new Map(fields.map((f, i) => [f.id, answers[i]]));
    const fv = computeFormulas(schema, {
      value: (id) => { const d = byId.get(id)?.display; return typeof d === "string" ? parseFloat(d) : null; },
      rows: (id) => (byId.get(id)?.rows as Record<string, string>[] | undefined) ?? [],
    });
    fields.forEach((f, i) => {
      if (f.type !== "formula") return;
      const v = fv[f.id] ?? null;
      answers[i].display = v == null ? "—" : formatNumber(v, f.decimals ?? 2) + (f.unit ? " " + f.unit : "");
      if (outOfRange(v, f)) { answers[i].fail = true; fails.push(f.label + " (ค่านอกช่วง)"); }
    });
  }
  return { answers, fails, result: fails.length ? "fail" : "pass" };
}
