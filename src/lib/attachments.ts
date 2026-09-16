// ============================================================
// KROK · เอกสารที่เกี่ยวข้อง (คู่มือ / SOP / drawing / รูปตัวอย่าง)
// type + helper ที่ใช้ร่วมกันทั้งฝั่ง studio (แนบ) และหน้ากรอก (เปิดดู)
// ============================================================

export type AttachmentKind = "file" | "link";

export interface Attachment {
  id: string;
  fieldId: string | null; // null = เอกสารระดับฟอร์ม
  kind: AttachmentKind;
  name: string;
  mime: string;
  size: number;
  url: string | null; // เฉพาะ kind = 'link'
}

/** ขนาดไฟล์สูงสุดต่อชิ้น (MB) — กันคนอัปคู่มือ 200 MB ขึ้นมือถือหน้างาน */
export const MAX_ATTACH_MB = 20;
export const MAX_ATTACH_BYTES = MAX_ATTACH_MB * 1024 * 1024;
/** จำนวนเอกสารสูงสุดต่อ "จุดแนบ" (ระดับฟอร์ม 1 ชุด, ระดับฟิลด์ 1 ชุดต่อฟิลด์) */
export const MAX_ATTACH_PER_SLOT = 10;

export const ATTACH_ACCEPT =
  "application/pdf,image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,text/plain";

const ALLOWED_MIME_PREFIX = ["application/pdf", "image/", "video/mp4", "text/plain"];

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIX.some((p) => mime.startsWith(p));
}

export function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}
export function isPdf(mime: string): boolean {
  return mime === "application/pdf";
}
export function isVideo(mime: string): boolean {
  return mime.startsWith("video/");
}

export function fmtSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** URL ที่เปิดดูเอกสารได้จริง (ไฟล์ = ผ่าน API ที่ออก signed URL ให้) */
export function attachmentHref(a: Attachment): string {
  return a.kind === "link" ? a.url || "#" : `/api/attachments/${a.id}`;
}

/** นามสกุลจากชื่อไฟล์ (ใช้ตั้ง storage path) */
export function extOf(filename: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(filename);
  return m ? m[1].toLowerCase() : "bin";
}

/** แถวจาก DB → Attachment */
export function rowToAttachment(r: Record<string, unknown>): Attachment {
  return {
    id: r.id as string,
    fieldId: (r.field_id as string) ?? null,
    kind: (r.kind as AttachmentKind) || "file",
    name: (r.name as string) || "เอกสาร",
    mime: (r.mime as string) || "",
    size: Number(r.size_bytes ?? 0),
    url: (r.url as string) ?? null,
  };
}

/** แยกเอกสารตามจุดแนบ เพื่อให้หน้ากรอกหยิบไปใช้ได้เร็ว */
export function groupAttachments(list: Attachment[]): {
  form: Attachment[];
  byField: Record<string, Attachment[]>;
} {
  const form: Attachment[] = [];
  const byField: Record<string, Attachment[]> = {};
  for (const a of list) {
    if (!a.fieldId) form.push(a);
    else (byField[a.fieldId] ||= []).push(a);
  }
  return { form, byField };
}
