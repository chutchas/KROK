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
  /** คีย์ประจำเครื่อง (พิสูจน์ว่าเป็นเครื่องที่อนุมัติ — server ตรวจ hash) */
  deviceKey?: string | null;
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

/** ไฟล์นี้มีอยู่แล้ว (อัปโหลดรอบก่อน / ใบส่งไปแล้ว) — ไม่ใช่ปัญหา ให้ server ตัดสิน */
function alreadyThere(e: { message?: string; statusCode?: string | number }): boolean {
  return String(e.statusCode ?? "") === "409" || /exists|duplicate/i.test(e.message || "");
}

/** ส่งไม่ผ่านแบบที่ลองใหม่ก็ไม่ผ่าน (ฟอร์มปิด/ไม่มีสิทธิ์/เครื่องไม่ได้อนุมัติ) — คิวข้ามไปรายการถัดไป */
export class PermanentSubmitError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

// ส่งจริง — ใช้ทั้งตอนออนไลน์และตอน flush คิว
//   1) อัปโหลดรูปไป storage (ทีละ 3 ไฟล์)  2) ให้ server ตรวจสิทธิ์/เครื่อง คำนวณผลใหม่ แล้วบันทึก (/api/submit)
// สำเร็จ = return · throw Error = ลองใหม่ได้ · throw PermanentSubmitError = ลองใหม่ก็ไม่ผ่าน
export async function pushSubmission(supabase: SupabaseClient, p: PendingSubmission, extra: { caseId?: string | null; deviceKey?: string | null } = {}): Promise<{ result?: "pass" | "fail"; fails?: string[] }> {
  // ใบที่ส่งสำเร็จไปแล้ว storage จะไม่รับไฟล์เพิ่ม (0057) — error ตรงนี้ไม่ใช่ปัญหา ให้ server ตัดสิน
  // อัปโหลดไม่ขึ้น (ยกเว้นไฟล์มีอยู่แล้วจากรอบก่อน) → หยุด ให้ลองใหม่/เข้าคิว — ไม่ส่งใบที่รูปหาย
  let sent: boolean | null = null;
  const up = async (path: string, dataUrl: string) => {
    const { error } = await supabase.storage.from("submissions").upload(path, dataUrlToBlob(dataUrl), { contentType: "image/jpeg", upsert: false });
    if (!error || alreadyThere(error)) return;
    // ใบที่ส่งสำเร็จไปแล้ว storage ไม่รับไฟล์เพิ่ม (RLS) → ถ้าใบนั้นมีอยู่แล้ว ปล่อยให้ server ตอบว่าเคยส่ง
    if (sent === null) sent = !!(await supabase.from("submissions").select("id").eq("id", p.subId).maybeSingle()).data;
    if (!sent) throw new Error(error.message || "upload failed"); // เช่น พื้นที่ไฟล์เต็ม / เน็ตหลุด → ลองใหม่ ไม่ส่งใบที่รูปหาย
  };
  for (let i = 0; i < p.photos.length; i += 3) {
    await Promise.all(p.photos.slice(i, i + 3).map((ph) => up(`${p.tenantId}/${p.subId}/${ph.fieldId}.jpg`, ph.dataUrl)));
  }
  for (const ex of p.docExtracts ?? []) {
    if (ex.dataUrl) await up(`${p.tenantId}/${p.subId}/doc_${ex.source_id}.jpg`, ex.dataUrl);
  }

  let res: Response;
  try {
    res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subId: p.subId,
        tenantId: p.tenantId,
        formId: p.formId,
        version: p.version,
        caseId: extra.caseId ?? null,
        answers: p.answers,
        dur: p.dur,
        deviceKey: extra.deviceKey ?? p.deviceKey ?? null,
        photos: p.photos.map((ph) => ({ fieldId: ph.fieldId, ai: ph.ai })),
        docExtracts: (p.docExtracts ?? []).map((ex) => ({ source_id: ex.source_id, raw: ex.raw, accepted: ex.accepted })),
        offline: p.queuedAt > 0,
      }),
    });
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e)); // เครือข่ายหลุด → ลองใหม่
  }
  const j = (await res.json().catch(() => ({}))) as { error?: string; result?: "pass" | "fail"; fails?: string[] };
  if (res.ok) return { result: j.result, fails: j.fails };
  const msg = j.error || `HTTP ${res.status}`;
  // 401 = session หมด/ยังไม่ผ่าน 2FA · 402 = โควตาเต็ม (ข้อความมีแท็ก [quota:…]) · 408/429/5xx = ลองใหม่ได้ · 4xx อื่น = ไม่ผ่านถาวร
  if (res.status === 401 || res.status === 402 || res.status === 408 || res.status === 429 || res.status >= 500) throw new Error(msg);
  throw new PermanentSubmitError(msg, res.status);
}
