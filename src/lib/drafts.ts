"use client";
// ============================================================
// KROK · แบบร่างการกรอกฟอร์ม (submission_drafts) — ฝั่ง browser
//
// เก็บบน server: กรอกต่อข้ามเครื่องได้ / ไม่หายเมื่อปิดหน้า
// ไฟล์ (รูปถ่าย, ลายเซ็น, รูปเอกสาร) อัปโหลดไป bucket 'drafts'
//   <tenant>/<user>/<draft>/<key>.jpg|png   key = p_<fieldId> | s_<fieldId> | d_<n>
// อัปโหลดเฉพาะไฟล์ที่เปลี่ยนตั้งแต่บันทึกครั้งก่อน (เทียบลายนิ้วมือของ dataURL)
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";

export const DRAFT_BUCKET = "drafts";
export const DRAFT_TTL_DAYS = 30;

export interface DraftDocExtract {
  source_id: string;
  dataUrl?: string;
  raw: { key: string; value: string; confidence: number }[];
  accepted: { key: string; field_id: string; value: string; edited: boolean }[];
}

/** ข้อมูลร่างที่ส่งให้หน้ากรอก (จาก server) */
export interface DraftData {
  id: string;
  formVersion: number;
  title: string;
  stepIdx: number;
  mode: "mobile" | "paper";
  answers: Record<string, unknown>;
  media: Record<string, string>;
  docExtracts: DraftDocExtract[];
  updatedAt: string;
}

export interface DraftSnapshot {
  tenantId: string;
  userId: string;
  formId: string;
  formVersion: number;
  title: string;
  stepIdx: number;
  mode: "mobile" | "paper";
  answers: Record<string, unknown>;
  photos: Record<string, string>; // fieldId → dataURL
  sigs: Record<string, string>;
  docExtracts: DraftDocExtract[];
  filled: number;
  total: number;
}

/** ลายนิ้วมือแบบเร็วของ dataURL (ไม่ต้อง hash ทั้งก้อน) */
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

/**
 * บันทึกร่าง (สร้างใหม่หรือเขียนทับ) — คืน id ของร่าง
 * uploaded: แคช key → ลายนิ้วมือ ของไฟล์ที่อัปโหลดไปแล้ว (ผู้เรียกเก็บไว้ข้ามการบันทึก)
 */
export async function saveDraft(
  supabase: SupabaseClient,
  draftId: string | null,
  snap: DraftSnapshot,
  uploaded: Map<string, string>,
  prevMedia: Record<string, string>
): Promise<{ id: string; media: Record<string, string> }> {
  const id = draftId ?? crypto.randomUUID();
  const base = `${snap.tenantId}/${snap.userId}/${id}`;

  // ไฟล์ที่ต้องมีในร่างรอบนี้
  const files: { key: string; dataUrl: string; ext: "jpg" | "png" }[] = [];
  for (const [fid, d] of Object.entries(snap.photos)) files.push({ key: `p:${fid}`, dataUrl: d, ext: "jpg" });
  for (const [fid, d] of Object.entries(snap.sigs)) files.push({ key: `s:${fid}`, dataUrl: d, ext: "png" });
  snap.docExtracts.forEach((ex, i) => { if (ex.dataUrl) files.push({ key: `d:${i}`, dataUrl: ex.dataUrl, ext: "jpg" }); });

  const media: Record<string, string> = {};
  for (const f of files) {
    const path = `${base}/${f.key.replace(":", "_")}.${f.ext}`;
    const fp = fingerprint(f.dataUrl);
    if (uploaded.get(f.key) !== fp || prevMedia[f.key] !== path) {
      const { error } = await supabase.storage
        .from(DRAFT_BUCKET)
        .upload(path, dataUrlToBlob(f.dataUrl), { contentType: f.ext === "png" ? "image/png" : "image/jpeg", upsert: true });
      if (error) throw new Error("อัปโหลดรูปของร่างไม่สำเร็จ: " + error.message);
      uploaded.set(f.key, fp);
    }
    media[f.key] = path;
  }

  // ไฟล์ที่เคยมีแต่ถูกเอาออก (ถ่ายรูปใหม่เป็นไม่มี / ล้างลายเซ็น) → ลบทิ้ง
  const stale = Object.entries(prevMedia).filter(([k, p]) => !media[k] && p.startsWith(base + "/")).map(([, p]) => p);
  if (stale.length) await supabase.storage.from(DRAFT_BUCKET).remove(stale);
  for (const k of Object.keys(prevMedia)) if (!media[k]) uploaded.delete(k);

  const row = {
    id,
    tenant_id: snap.tenantId,
    form_id: snap.formId,
    user_id: snap.userId,
    form_version: snap.formVersion,
    title: snap.title.slice(0, 120),
    step_idx: snap.stepIdx,
    mode: snap.mode,
    answers: snap.answers,
    media,
    // รูปเอกสารอยู่ใน media แล้ว ไม่ต้องเก็บ dataURL ซ้ำใน jsonb
    doc_extracts: snap.docExtracts.map((ex) => ({ source_id: ex.source_id, raw: ex.raw, accepted: ex.accepted })),
    filled: snap.filled,
    total: snap.total,
  };
  const { error } = await supabase.from("submission_drafts").upsert(row, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return { id, media };
}

/** โหลดไฟล์ของร่างกลับมาเป็น dataURL (ใช้ต่อกับขั้นตอนส่งเดิมได้ทันที) */
export async function loadDraftMedia(
  supabase: SupabaseClient,
  media: Record<string, string>
): Promise<{ photos: Record<string, string>; sigs: Record<string, string>; docs: Record<number, string> }> {
  const out = { photos: {} as Record<string, string>, sigs: {} as Record<string, string>, docs: {} as Record<number, string> };
  const entries = Object.entries(media);
  if (!entries.length) return out;
  const { data } = await supabase.storage.from(DRAFT_BUCKET).createSignedUrls(entries.map(([, p]) => p), 600);
  const urlOf = new Map((data || []).map((d) => [d.path, d.signedUrl]));
  await Promise.all(
    entries.map(async ([key, path]) => {
      const url = urlOf.get(path);
      if (!url) return;
      try {
        const d = await blobToDataUrl(await (await fetch(url)).blob());
        const [kind, rest] = [key.slice(0, 1), key.slice(2)];
        if (kind === "p") out.photos[rest] = d;
        else if (kind === "s") out.sigs[rest] = d;
        else if (kind === "d") out.docs[Number(rest)] = d;
      } catch { /* ไฟล์หาย = ข้าม ผู้กรอกถ่ายใหม่ได้ */ }
    })
  );
  return out;
}

/** ลบร่าง + ไฟล์ของร่าง */
export async function deleteDraft(supabase: SupabaseClient, id: string, media: Record<string, string>): Promise<void> {
  const paths = Object.values(media || {});
  if (paths.length) await supabase.storage.from(DRAFT_BUCKET).remove(paths);
  await supabase.from("submission_drafts").delete().eq("id", id);
}
