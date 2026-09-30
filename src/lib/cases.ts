"use client";
// ============================================================
// KROK · งาน (ฟอร์มกรอกหลายคน) — ฝั่ง browser
//
// ไฟล์ของงานอยู่ bucket 'cases': <tenant>/<case>/<step>/<key>.jpg|png
//   key = p_<fieldId> | s_<fieldId> | d_<rand>
// storage policy ให้เขียนได้เฉพาะผู้ถืองาน และเฉพาะโฟลเดอร์ของขั้นในช่วงที่ถืออยู่
// case_save (RPC) รับเฉพาะคำตอบ/ไฟล์ของฟิลด์ในช่วงนั้น ส่วนอื่นคงค่าเดิมบน server
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormSchema } from "@/lib/form-schema";
import type { CaseDocExtract } from "@/lib/case-flow";

export const CASE_BUCKET = "cases";

function fingerprint(d: string): string {
  return `${d.length}:${d.slice(-64)}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

/** field id → index ของขั้น */
export function fieldStepMap(schema: FormSchema): Map<string, number> {
  const m = new Map<string, number>();
  schema.steps.forEach((s, i) => s.fields.forEach((f) => m.set(f.id, i)));
  return m;
}

export interface CaseSnapshot {
  tenantId: string;
  caseId: string;
  schema: FormSchema;
  segStart: number;
  segEnd: number;
  title: string;
  answers: Record<string, unknown>;
  photos: Record<string, string>;
  sigs: Record<string, string>;
  docExtracts: CaseDocExtract[];
  filled: number;
  total: number;
}

/**
 * บันทึกความคืบหน้าของช่วงที่ถืออยู่
 * uploaded: แคช key → ลายนิ้วมือ ของไฟล์ที่อยู่บน server แล้ว (ผู้เรียกเก็บไว้ข้ามการบันทึก)
 * คืน media ใหม่ (เฉพาะของช่วงนี้) — docExtracts ถูกเติม path ในตัว
 */
export async function saveCase(
  supabase: SupabaseClient,
  snap: CaseSnapshot,
  uploaded: Map<string, string>,
  prevMedia: Record<string, string>
): Promise<{ media: Record<string, string>; updatedAt: string }> {
  const stepOf = fieldStepMap(snap.schema);
  // ขั้นของหลักฐาน AI อ่านเอกสาร = ขั้นที่มีแหล่งเติมข้อมูลนั้น
  const srcStep = new Map<string, number>();
  snap.schema.steps.forEach((s, i) => (s.fill_sources || []).forEach((fs) => srcStep.set(fs.id, i)));
  for (const ex of snap.docExtracts) if (ex.step == null) ex.step = srcStep.get(ex.source_id) ?? snap.segStart;
  const inSeg = (i: number | undefined) => i !== undefined && i >= snap.segStart && i <= snap.segEnd;
  const base = `${snap.tenantId}/${snap.caseId}`;

  const files: { key: string; step: number; dataUrl: string; ext: "jpg" | "png" }[] = [];
  for (const [fid, d] of Object.entries(snap.photos)) { const st = stepOf.get(fid); if (inSeg(st)) files.push({ key: `p:${fid}`, step: st!, dataUrl: d, ext: "jpg" }); }
  for (const [fid, d] of Object.entries(snap.sigs)) { const st = stepOf.get(fid); if (inSeg(st)) files.push({ key: `s:${fid}`, step: st!, dataUrl: d, ext: "png" }); }

  const media: Record<string, string> = {};
  for (const f of files) {
    const path = `${base}/${f.step}/${f.key.replace(":", "_")}.${f.ext}`;
    const fp = fingerprint(f.dataUrl);
    if (uploaded.get(f.key) !== fp || prevMedia[f.key] !== path) {
      const { error } = await supabase.storage
        .from(CASE_BUCKET)
        .upload(path, dataUrlToBlob(f.dataUrl), { contentType: f.ext === "png" ? "image/png" : "image/jpeg", upsert: true });
      if (error) throw new Error("อัปโหลดรูปไม่สำเร็จ: " + error.message);
      uploaded.set(f.key, fp);
    }
    media[f.key] = path;
  }

  // ไฟล์ของช่วงนี้ที่ถูกเอาออก (ล้างรูป/ลายเซ็น) → ลบทิ้ง
  const stale = Object.entries(prevMedia)
    .filter(([k, p]) => !media[k] && inSeg(stepOf.get(k.slice(2))) && p.startsWith(base + "/"))
    .map(([k, p]) => { uploaded.delete(k); return p; });
  if (stale.length) await supabase.storage.from(CASE_BUCKET).remove(stale);

  // รูปเอกสารที่ AI อ่าน (เฉพาะของช่วงนี้ที่ยังไม่มี path)
  for (const ex of snap.docExtracts) {
    if (!inSeg(ex.step) || !ex.dataUrl || ex.path) continue;
    const path = `${base}/${ex.step}/d_${crypto.randomUUID().slice(0, 8)}.jpg`;
    const { error } = await supabase.storage.from(CASE_BUCKET).upload(path, dataUrlToBlob(ex.dataUrl), { contentType: "image/jpeg", upsert: true });
    if (!error) ex.path = path;
  }

  const { data, error } = await supabase.rpc("case_save", {
    p_case: snap.caseId,
    p_answers: snap.answers,
    p_media: media,
    p_doc_extracts: snap.docExtracts
      .filter((ex) => inSeg(ex.step))
      .map((ex) => ({ source_id: ex.source_id, step: ex.step, path: ex.path ?? null, raw: ex.raw, accepted: ex.accepted })),
    p_title: snap.title,
    p_filled: snap.filled,
    p_total: snap.total,
  });
  if (error) throw new Error(error.message);
  return { media, updatedAt: String(data ?? new Date().toISOString()) };
}

/** โหลดไฟล์ทั้งหมดของงานกลับมาเป็น dataURL (ขั้นก่อนหน้าไว้แสดง, ขั้นสุดท้ายใช้ส่ง submission) */
export async function loadCaseMedia(
  supabase: SupabaseClient,
  media: Record<string, string>,
  docs: CaseDocExtract[]
): Promise<{ photos: Record<string, string>; sigs: Record<string, string> }> {
  const out = { photos: {} as Record<string, string>, sigs: {} as Record<string, string> };
  const paths = [...Object.values(media), ...docs.map((d) => d.path).filter((p): p is string => !!p)];
  if (!paths.length) return out;
  const { data } = await supabase.storage.from(CASE_BUCKET).createSignedUrls(paths, 600);
  const urlOf = new Map((data || []).map((d) => [d.path, d.signedUrl]));
  const fetchData = async (path: string) => {
    const url = urlOf.get(path);
    if (!url) return null;
    try { return await blobToDataUrl(await (await fetch(url)).blob()); } catch { return null; }
  };
  await Promise.all([
    ...Object.entries(media).map(async ([key, path]) => {
      const d = await fetchData(path);
      if (!d) return;
      if (key.startsWith("p:")) out.photos[key.slice(2)] = d;
      else if (key.startsWith("s:")) out.sigs[key.slice(2)] = d;
    }),
    ...docs.map(async (ex) => {
      if (!ex.path) return;
      const d = await fetchData(ex.path);
      if (d) ex.dataUrl = d;
    }),
  ]);
  return out;
}
