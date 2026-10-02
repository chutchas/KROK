"use client";
// คิวส่งฟอร์มแบบออฟไลน์ — เก็บใน IndexedDB แล้ว sync เมื่อกลับมาออนไลน์
import type { SupabaseClient } from "@supabase/supabase-js";

const DB = "krok_offline";
const STORE = "pending_submissions";

export interface PendingSubmission {
  subId: string;
  tenantId: string;
  formId: string;
  title: string;
  icon: string;
  version: number;
  userId: string;
  userName: string;
  requiresApproval: boolean;
  approvalChain: unknown[];
  result: "pass" | "fail";
  fails: string[];
  answers: Record<string, unknown>[];
  dur: number;
  photos: { fieldId: string; dataUrl: string; ai?: string }[];
  /** หลักฐานการอ่านเอกสารด้วย AI (fill source kind = "doc") */
  docExtracts?: {
    source_id: string;
    dataUrl?: string;
    raw: { key: string; value: string; confidence: number }[];
    accepted: { key: string; field_id: string; value: string; edited: boolean }[];
  }[];
  deviceId?: string | null;
  queuedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "subId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export async function enqueue(p: PendingSubmission): Promise<void> {
  await tx("readwrite", (s) => s.put(p));
}

export async function getAllPending(): Promise<PendingSubmission[]> {
  try {
    return (await tx<PendingSubmission[]>("readonly", (s) => s.getAll())) || [];
  } catch {
    return [];
  }
}

export async function removePending(subId: string): Promise<void> {
  try { await tx("readwrite", (s) => s.delete(subId)); } catch { /* ignore */ }
}

export async function countPending(): Promise<number> {
  try { return await tx<number>("readonly", (s) => s.count()); } catch { return 0; }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ส่งจริงขึ้น Supabase — ใช้ทั้งตอนออนไลน์และตอน flush คิว
// คืน true ถ้าสำเร็จ (แถวถูกบันทึก), throw ถ้าเครือข่าย/ผิดพลาดควรลองใหม่
export async function pushSubmission(supabase: SupabaseClient, p: PendingSubmission): Promise<void> {
  const { error: subErr } = await supabase.from("submissions").insert({
    id: p.subId,
    tenant_id: p.tenantId,
    form_id: p.formId,
    form_title: p.title,
    form_icon: p.icon,
    form_version: p.version,
    submitted_by: p.userId,
    user_name: p.userName,
    result: p.result,
    fails: p.fails,
    answers: p.answers,
    duration_s: p.dur,
    device_id: p.deviceId ?? null,
    approval_status: p.requiresApproval ? "pending" : "none",
    approval_chain: p.requiresApproval ? p.approvalChain : [],
    approval_step: 0,
    approval_history: [],
  });
  // 23505 = duplicate key → ถือว่าเคยส่งสำเร็จแล้ว (ไม่ต้องลองซ้ำ)
  if (subErr && subErr.code !== "23505") throw subErr;

  // อัปโหลดรูปทีละ 3 ไฟล์พร้อมกัน (เดิมทีละไฟล์ — ฟอร์มที่มีรูปเยอะส่งช้ามากบนเน็ตมือถือ) แล้วบันทึกแถวรูปครั้งเดียว
  const rows: { tenant_id: string; submission_id: string; field_id: string; storage_path: string; ai_check: unknown }[] = [];
  for (let i = 0; i < p.photos.length; i += 3) {
    await Promise.all(p.photos.slice(i, i + 3).map(async (ph) => {
      const path = `${p.tenantId}/${p.subId}/${ph.fieldId}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("submissions")
        .upload(path, dataUrlToBlob(ph.dataUrl), { contentType: "image/jpeg", upsert: true });
      if (!upErr) rows.push({ tenant_id: p.tenantId, submission_id: p.subId, field_id: ph.fieldId, storage_path: path, ai_check: ph.ai ?? null });
    }));
  }
  if (rows.length) await supabase.from("submission_photos").insert(rows);

  // หลักฐานการอ่านเอกสาร — เก็บรูปต้นฉบับ + ค่าที่ AI อ่านได้ทั้งหมด + ค่าที่คนยืนยัน
  for (const ex of p.docExtracts ?? []) {
    let path: string | null = null;
    if (ex.dataUrl) {
      const p2 = `${p.tenantId}/${p.subId}/doc_${ex.source_id}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("submissions")
        .upload(p2, dataUrlToBlob(ex.dataUrl), { contentType: "image/jpeg", upsert: true });
      if (!upErr) path = p2;
    }
    await supabase.from("submission_doc_extracts").insert({
      tenant_id: p.tenantId,
      submission_id: p.subId,
      source_id: ex.source_id,
      storage_path: path,
      raw: ex.raw,
      accepted: ex.accepted,
      created_by: p.userId,
    });
  }

  // query builder ของ supabase ไม่ยิงจนกว่าจะ await/then — void เฉย ๆ = ไม่ได้บันทึก
  void supabase.from("audit_log").insert({
    tenant_id: p.tenantId,
    actor_id: p.userId,
    action: "submission.create",
    target_type: "submission",
    target_id: p.subId,
    meta: { form_id: p.formId, result: p.result, fails: p.fails.length, offline: p.queuedAt > 0 },
  }).then(() => {}, () => {});
}
