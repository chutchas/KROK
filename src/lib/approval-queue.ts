// ============================================================
// KROK · คิวรออนุมัติ — ตัวช่วยล้วน (ใช้ได้ทั้ง server/client · ไม่มี I/O)
// - สรุปหลักฐาน (ข้อไม่ผ่าน + รูปที่ควรเห็นก่อนกดอนุมัติ) จาก answers
// - กรองคิว (ฟอร์ม / ผล / พื้นที่ / ค้นหา)
// - กติกาเหตุผลตีกลับ · จำกัดจำนวนอนุมัติทีละหลายใบ · สรุปผลอนุมัติหลายใบ
// ============================================================
import { answerPhotoKeys } from "@/lib/photo-slots";
import { cellPhotoKey } from "@/lib/table-rows";

/** เหตุผลตีกลับขั้นต่ำ (ตัวอักษร หลังตัดช่องว่าง) — ใช้ทั้งปุ่มบนหน้าจอและ server action */
export const MIN_REJECT_REASON = 3;
/** อนุมัติทีละหลายใบได้สูงสุดกี่ใบต่อครั้ง */
export const BULK_APPROVE_MAX = 50;
/** รูปย่อสูงสุดต่อใบ (ขอ signed URL เท่านี้) */
export const MAX_THUMBS = 6;
/** แสดงในหน้าทีละกี่ใบ (กดแสดงเพิ่มได้) — คิว 500 ใบไม่ต้อง render พร้อมกัน */
export const QUEUE_PAGE = 20;

export function isRejectReasonValid(note: unknown): boolean {
  return typeof note === "string" && note.trim().length >= MIN_REJECT_REASON;
}

// ---------- หลักฐาน ----------
interface AnswerLike {
  label: string;
  type: string;
  display?: string;
  note?: string;
  fail?: boolean;
  photoField?: string;
  photoFields?: string[];
  photoLabels?: string[];
  rows?: Record<string, string>[];
  columns?: { id: string; label: string; type?: string }[];
}

export interface FailedAnswer {
  label: string;
  display?: string;
  note?: string;
  /** ตาราง: แถว/คอลัมน์ที่ไม่ผ่าน เช่น "แถว 2: สภาพ" */
  details?: string[];
}
export interface EvidencePhoto {
  key: string;
  label: string;
}
export interface Evidence {
  failed: FailedAnswer[];
  /** รูปที่จะขอ signed URL (ไม่เกิน MAX_THUMBS) */
  photos: EvidencePhoto[];
  /** จำนวนรูปทั้งหมดที่มี (ไว้บอก "+N รูป") */
  photoTotal: number;
}

const clip = (s: string | undefined, n: number) => (typeof s === "string" && s.length > n ? s.slice(0, n) + "…" : s);

/**
 * หลักฐานของใบหนึ่ง: ข้อที่ไม่ผ่าน (พร้อมหมายเหตุ) + รูป
 * รูป: รูปในแถวตารางที่ไม่ผ่านก่อน แล้วตามด้วยฟิลด์รูปถ่ายของใบ (ช่างมักถ่ายจุดที่ผิดปกติไว้ในฟิลด์รูป)
 * ใบที่ไม่มีข้อไม่ผ่าน → ไม่ดึงรูป (ประหยัดการขอ URL · เปิดมุมมองเอกสารได้)
 */
export function buildEvidence(answers: AnswerLike[], max = MAX_THUMBS): Evidence {
  const failed: FailedAnswer[] = [];
  const rowPhotos: EvidencePhoto[] = [];
  const fieldPhotos: EvidencePhoto[] = [];

  for (const a of answers) {
    if (!a || typeof a !== "object") continue;
    if (a.fail) {
      const item: FailedAnswer = { label: a.label, display: clip(a.display, 200), note: clip(a.note, 300) };
      if (a.type === "table" && Array.isArray(a.rows)) {
        const cols = a.columns || [];
        const details: string[] = [];
        a.rows.forEach((r, ri) => {
          const bad = cols.filter((c) => c.type === "pass_fail" && r?.[c.id] === "fail");
          if (!bad.length) return;
          details.push(`แถว ${ri + 1}: ${bad.map((c) => c.label).join(", ")}`);
          for (const c of cols)
            if (c.type === "photo") {
              const k = cellPhotoKey(r, c.id);
              if (k) rowPhotos.push({ key: k, label: `${a.label} แถว ${ri + 1}` });
            }
        });
        if (details.length) item.details = details.slice(0, 10);
      }
      failed.push(item);
    } else if (a.type === "photo") {
      const ks = answerPhotoKeys(a);
      ks.forEach((k, i) => {
        const cap = a.photoLabels?.[i]?.trim();
        fieldPhotos.push({ key: k, label: cap ? `${a.label} — ${cap}` : ks.length > 1 ? `${a.label} (${i + 1}/${ks.length})` : a.label });
      });
    }
  }

  if (!failed.length) return { failed, photos: [], photoTotal: 0 };
  const all = [...rowPhotos, ...fieldPhotos];
  return { failed, photos: all.slice(0, Math.max(0, max)), photoTotal: all.length };
}

// ---------- กรองคิว ----------
export interface QueueItemLike {
  form_id?: string | null;
  form_title: string;
  user_name?: string | null;
  fails?: string[] | null;
  area?: { id: string; name: string } | null;
}
export type ResultFilter = "all" | "fail" | "pass";
export interface QueueFilter {
  /** "" = ทุกฟอร์ม · ค่าจาก formKey() */
  form: string;
  result: ResultFilter;
  /** "" = ทุกพื้นที่ */
  area: string;
  q: string;
}
export const EMPTY_FILTER: QueueFilter = { form: "", result: "all", area: "", q: "" };

/** key ของฟอร์ม (ใบเก่าที่ไม่มี form_id ใช้ชื่อแทน) */
export const formKey = (s: QueueItemLike) => s.form_id || "t:" + s.form_title;
const hasFails = (s: QueueItemLike) => (s.fails?.length ?? 0) > 0;

export function filterQueue<T extends QueueItemLike>(items: T[], f: QueueFilter): T[] {
  const q = f.q.trim().toLowerCase();
  return items.filter((s) => {
    if (f.form && formKey(s) !== f.form) return false;
    if (f.result === "fail" && !hasFails(s)) return false;
    if (f.result === "pass" && hasFails(s)) return false;
    if (f.area && s.area?.id !== f.area) return false;
    if (q && !(s.form_title || "").toLowerCase().includes(q) && !(s.user_name || "").toLowerCase().includes(q)) return false;
    return true;
  });
}

export interface Option { value: string; label: string; count: number }

/** ตัวเลือกฟอร์มในคิว (เรียงตามชื่อ พร้อมจำนวน) */
export function formOptions(items: QueueItemLike[]): Option[] {
  const m = new Map<string, Option>();
  for (const s of items) {
    const k = formKey(s);
    const o = m.get(k);
    if (o) o.count++;
    else m.set(k, { value: k, label: s.form_title || "—", count: 1 });
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "th"));
}

/** ตัวเลือกพื้นที่ (เฉพาะใบที่มีพื้นที่ · ไม่มีเลย = [] → ไม่แสดงตัวกรอง) */
export function areaOptions(items: QueueItemLike[]): Option[] {
  const m = new Map<string, Option>();
  for (const s of items) {
    if (!s.area) continue;
    const o = m.get(s.area.id);
    if (o) o.count++;
    else m.set(s.area.id, { value: s.area.id, label: s.area.name || "—", count: 1 });
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "th"));
}

// ---------- อนุมัติหลายใบ ----------
export type BulkItemResult = { id: string; ok: true; advanced?: boolean } | { id: string; ok: false; error: string };

export interface BulkSummary {
  ok: number;
  /** ในจำนวนที่สำเร็จ: เลื่อนไปขั้นถัดไป (ยังไม่จบ chain) */
  advanced: number;
  failed: { id: string; error: string }[];
}

export function summarizeBulk(results: BulkItemResult[]): BulkSummary {
  const s: BulkSummary = { ok: 0, advanced: 0, failed: [] };
  for (const r of results) {
    if (r.ok) {
      s.ok++;
      if (r.advanced) s.advanced++;
    } else s.failed.push({ id: r.id, error: r.error });
  }
  return s;
}

/** รายการ id ที่ไม่ซ้ำ (ตัดค่าที่ไม่ใช่ข้อความ) และไม่เกิน max */
export function capIds(ids: unknown[], max = BULK_APPROVE_MAX): string[] {
  const out: string[] = [];
  for (const x of ids) {
    if (typeof x !== "string" || !x || out.includes(x)) continue;
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

/** เรียก fn กับทุกรายการ พร้อมกันไม่เกิน limit · ผลตามลำดับเดิม */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
