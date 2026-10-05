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
  /** พิกัดตอนส่ง (ฟอร์มที่เปิด GPS) */
  geo?: { lat: number; lng: number; acc: number; at: number } | null;
  queuedAt: number;
}

const STORES: [string, string][] = [[STORE, "subId"], ["offline_bundles", "key"], ["local_drafts", "key"]];

function openRaw(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = version ? indexedDB.open(DB, version) : indexedDB.open(DB);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
    };
    // แท็บอื่นถือการเชื่อมต่อเก่าอยู่ → รอให้มันปิด (ไม่ล้มทันที — upgrade จะสำเร็จตามมา)
    let tm: ReturnType<typeof setTimeout> | undefined;
    req.onblocked = () => { tm = setTimeout(() => reject(new Error("db blocked — ปิดแท็บ KROK อื่นแล้วลองใหม่")), 8000); };
    req.onsuccess = () => {
      if (tm) clearTimeout(tm);
      const db = req.result;
      // แท็บอื่นจะอัปเวอร์ชัน → ปิดของเราเพื่อไม่ขวาง
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => { if (tm) clearTimeout(tm); reject(req.error); };
  });
}

/**
 * ฐานข้อมูลในเครื่องของ KROK — ทุกโมดูลเปิดผ่านฟังก์ชันนี้
 * เปิดแบบไม่ระบุเวอร์ชัน (ได้เวอร์ชันปัจจุบันเสมอ แม้โค้ดเวอร์ชันใหม่กว่าอัปไปแล้ว — ไม่เกิด VersionError)
 * ขาด store ไหน → อัปเวอร์ชัน +1 แล้วสร้างเพิ่ม
 */
export async function openDb(): Promise<IDBDatabase> {
  const db = await openRaw();
  if (STORES.every(([n]) => db.objectStoreNames.contains(n))) return db;
  const next = db.version + 1;
  db.close();
  return openRaw(next);
}

/** ข้อผิดพลาดตอนบันทึก (พื้นที่เต็ม ฯลฯ) — แยกให้หน้าจอบอกผู้ใช้ได้ */
export function isQuotaExceeded(e: unknown): boolean {
  const n = (e as { name?: string } | null)?.name;
  return n === "QuotaExceededError" || n === "NS_ERROR_DOM_QUOTA_REACHED";
}

/**
 * ทำงานกับ store หนึ่งใน transaction เดียว
 * คืนผลเมื่อ transaction commit แล้วเท่านั้น (พื้นที่เต็มจะล้มตอน commit — ถ้าคืนตอน request สำเร็จจะเข้าใจผิดว่าบันทึกแล้ว)
 */
export async function runTx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let result: T;
    let t: IDBTransaction;
    try {
      t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      req.onsuccess = () => { result = req.result as T; };
    } catch (e) {
      db.close();
      reject(e);
      return;
    }
    t.oncomplete = () => { db.close(); resolve(result); };
    t.onabort = () => { db.close(); reject(t.error ?? new Error("transaction aborted")); };
    t.onerror = () => { /* ตามด้วย onabort */ };
  });
}

const tx = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest) => runTx<T>(STORE, mode, fn);

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

/** พื้นที่ไฟล์ของกลุ่ม workspace เต็มตามแพ็กเกจแล้วไหม (ถามไม่ได้ = ไม่แน่ใจ → false) */
async function storageFull(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  try {
    const [lim, used] = await Promise.all([
      supabase.rpc("plan_limit", { p_tenant: tenantId, p_name: "storageMb" }),
      supabase.rpc("pool_storage_bytes", { p_tenant: tenantId }),
    ]);
    const mb = Number(lim.data);
    return !lim.error && !used.error && Number.isFinite(mb) && mb > 0 && mb < 999999 && Number(used.data) >= mb * 1048576;
  } catch {
    return false;
  }
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
    if (sent) return;
    // RLS ไม่รับไฟล์ ส่วนใหญ่ = พื้นที่ไฟล์ของแพ็กเกจเต็ม → แจ้งเป็นข้อความโควตา (หน้ากรอก/คิวแสดงตรง ๆ ไม่วนส่งซ้ำ)
    if (/row-level security|policy|403|unauthorized/i.test(error.message || "") && (await storageFull(supabase, p.tenantId))) {
      throw new Error("พื้นที่ไฟล์ของแพ็กเกจเต็ม ส่งรูปไม่ได้ — ให้เจ้าของบัญชีอัปเกรดแพ็กเกจหรือลบไฟล์ที่ไม่ใช้ (ข้อมูลยังเก็บในเครื่องนี้) [quota:storage]");
    }
    throw new Error(error.message || "upload failed"); // เน็ตหลุด ฯลฯ → ลองใหม่ ไม่ส่งใบที่รูปหาย
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
        geo: p.geo ?? null,
        // เวลาที่กดส่งบนเครื่อง — เฉพาะใบที่เข้าคิวตอนออฟไลน์ (ส่งออนไลน์ใช้เวลาของ server อย่างเดียว)
        filledAt: p.queuedAt > 0 ? p.queuedAt : null,
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
