"use client";
// ชุดฟอร์มออฟไลน์ + แบบร่างในเครื่อง (IndexedDB เดียวกับคิวส่งฟอร์ม)
import { openDb } from "@/lib/offline-queue";
import type { OfflineBundle } from "@/lib/offline-types";

type StoreName = "offline_bundles" | "local_drafts";

async function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

// ---------- ชุดฟอร์ม ----------
export interface StoredBundle extends OfflineBundle { key: string }

export async function saveBundle(b: OfflineBundle): Promise<void> {
  await run("offline_bundles", "readwrite", (s) => s.put({ ...b, key: `${b.userId}:${b.tenantId}` }));
  try { localStorage.setItem("krok_offline_last", `${b.userId}:${b.tenantId}`); } catch { /* ignore */ }
}

export async function getBundle(userId: string, tenantId: string): Promise<StoredBundle | null> {
  try { return (await run<StoredBundle | undefined>("offline_bundles", "readonly", (s) => s.get(`${userId}:${tenantId}`))) ?? null; }
  catch { return null; }
}

/** ชุดที่ใช้ล่าสุดในเครื่องนี้ (หน้าออฟไลน์ไม่รู้ว่าใครล็อกอิน — ใช้ของคนล่าสุด) */
export async function getLastBundle(): Promise<StoredBundle | null> {
  let key: string | null = null;
  try { key = localStorage.getItem("krok_offline_last"); } catch { /* ignore */ }
  try {
    if (key) {
      const b = await run<StoredBundle | undefined>("offline_bundles", "readonly", (s) => s.get(key!));
      if (b) return b;
    }
    const all = (await run<StoredBundle[]>("offline_bundles", "readonly", (s) => s.getAll())) || [];
    return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null;
  } catch { return null; }
}

/** ออกจากระบบ → ลบชุดฟอร์มของผู้ใช้นี้ออกจากเครื่อง (คิวที่ยังไม่ส่งเก็บไว้ตามเดิม) */
export async function clearBundles(userId?: string): Promise<void> {
  try {
    const all = (await run<StoredBundle[]>("offline_bundles", "readonly", (s) => s.getAll())) || [];
    for (const b of all) if (!userId || b.userId === userId) await run("offline_bundles", "readwrite", (s) => s.delete(b.key));
    localStorage.removeItem("krok_offline_last");
  } catch { /* ignore */ }
}

// ---------- แบบร่างในเครื่อง (บันทึกตอนออฟไลน์) ----------
export interface LocalDraft {
  key: string;
  userId: string;
  tenantId: string;
  formId: string;
  formVersion: number;
  /** id ของร่างบน server ที่กรอกต่ออยู่ (ถ้ามี) */
  serverDraftId: string | null;
  title: string;
  stepIdx: number;
  mode: "mobile" | "paper";
  answers: Record<string, unknown>;
  photos: Record<string, string>;
  sigs: Record<string, string>;
  docExtracts: unknown[];
  updatedAt: number;
}

export const localDraftKey = (userId: string, formId: string) => `${userId}:${formId}`;

export async function saveLocalDraft(d: Omit<LocalDraft, "key">): Promise<void> {
  await run("local_drafts", "readwrite", (s) => s.put({ ...d, key: localDraftKey(d.userId, d.formId) }));
}

export async function getLocalDraft(userId: string, formId: string): Promise<LocalDraft | null> {
  try { return (await run<LocalDraft | undefined>("local_drafts", "readonly", (s) => s.get(localDraftKey(userId, formId)))) ?? null; }
  catch { return null; }
}

export async function listLocalDrafts(userId: string): Promise<LocalDraft[]> {
  try { return ((await run<LocalDraft[]>("local_drafts", "readonly", (s) => s.getAll())) || []).filter((d) => d.userId === userId); }
  catch { return []; }
}

export async function deleteLocalDraft(userId: string, formId: string): Promise<void> {
  try { await run("local_drafts", "readwrite", (s) => s.delete(localDraftKey(userId, formId))); } catch { /* ignore */ }
}
