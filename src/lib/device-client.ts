"use client";
// ============================================================
// KROK · ตัวตนของ "เครื่อง" ฝั่ง browser
// เครื่องสุ่มคีย์เก็บไว้ใน localStorage ครั้งเดียว — ฝั่ง server เก็บแค่ sha256
//
// ข้อจำกัดที่ต้องรู้: นี่ไม่ใช่ hardware attestation
// ล้างข้อมูลเบราว์เซอร์ = คีย์หาย ต้องขออนุมัติใหม่
// ============================================================

const KEY_STORE = "krok_device_key";
const STATE_STORE = "krok_device_state";

/** อายุของผลตรวจที่แคชไว้ — ให้เครื่องที่อนุมัติแล้วยังกรอกได้ตอนสัญญาณหลุด */
export const DEVICE_CACHE_MS = 24 * 60 * 60 * 1000;

export type DeviceStatus = "pending" | "approved" | "revoked";

export interface DeviceState {
  deviceId: string;
  status: DeviceStatus;
  name: string;
  at: number;
}

function rand(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  } catch {
    return Array.from({ length: 5 }, () => Math.random().toString(36).slice(2)).join("");
  }
}

/** คีย์ประจำเครื่อง (สร้างครั้งแรกที่เรียก) */
export function getDeviceKey(): string {
  if (typeof window === "undefined") return "";
  try {
    let k = localStorage.getItem(KEY_STORE);
    if (!k || k.length < 24) {
      k = rand();
      localStorage.setItem(KEY_STORE, k);
    }
    return k;
  } catch {
    // โหมดส่วนตัว / ปิด storage → ใช้คีย์ชั่วคราวต่อแท็บ (จะต้องขออนุมัติใหม่ทุกครั้ง)
    return rand();
  }
}

/** รหัสสั้นไว้ให้คนหน้างานอ่านให้ admin ฟังตอนขออนุมัติ */
export function deviceShortCode(key: string): string {
  return (key || "").slice(0, 6).toUpperCase();
}

/** เดาแพลตฟอร์มแบบหยาบ ๆ ไว้แสดงในหน้าจัดการเครื่อง */
export function guessPlatform(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  const os = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android"
    : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "อื่น ๆ";
  const br = /CriOS|Chrome/.test(ua) ? "Chrome" : /FxiOS|Firefox/.test(ua) ? "Firefox"
    : /EdgiOS|Edg/.test(ua) ? "Edge" : /Safari/.test(ua) ? "Safari" : "";
  return br ? `${os} · ${br}` : os;
}

/** ชื่อเริ่มต้นของเครื่อง เช่น "iPad ของ สมชาย" */
export function defaultDeviceName(userName: string): string {
  const p = guessPlatform().split(" · ")[0];
  return userName ? `${p} ของ ${userName}` : p;
}

function stateKey(tenantId: string) {
  return `${STATE_STORE}:${tenantId}`;
}

export function readDeviceState(tenantId: string): DeviceState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(stateKey(tenantId));
    if (!raw) return null;
    const v = JSON.parse(raw) as DeviceState;
    if (!v || typeof v.at !== "number") return null;
    return v;
  } catch {
    return null;
  }
}

export function writeDeviceState(tenantId: string, v: DeviceState): void {
  try { localStorage.setItem(stateKey(tenantId), JSON.stringify(v)); } catch { /* ignore */ }
}

export function clearDeviceState(tenantId: string): void {
  try { localStorage.removeItem(stateKey(tenantId)); } catch { /* ignore */ }
}

// ---- แคช "เครื่องนี้ผูกกับฟอร์มนี้แล้ว" (ใช้ตอนออฟไลน์) ----
const FORM_ALLOW_STORE = "krok_device_form";

export function writeFormAllow(formId: string, allowed: boolean): void {
  try { localStorage.setItem(`${FORM_ALLOW_STORE}:${formId}`, JSON.stringify({ allowed, at: Date.now() })); } catch { /* ignore */ }
}

/** true = เคยผ่านการตรวจกับ server ภายใน 24 ชม. ว่าใช้ฟอร์มนี้ได้ */
export function freshFormAllow(formId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(`${FORM_ALLOW_STORE}:${formId}`);
    if (!raw) return false;
    const v = JSON.parse(raw) as { allowed: boolean; at: number };
    return !!v?.allowed && Date.now() - v.at < DEVICE_CACHE_MS;
  } catch {
    return false;
  }
}

/** ผลตรวจที่ยังใช้แทน server ได้ (เฉพาะเครื่องที่ "อนุมัติแล้ว") */
export function freshApproved(tenantId: string): DeviceState | null {
  const s = readDeviceState(tenantId);
  if (!s || s.status !== "approved") return null;
  return Date.now() - s.at < DEVICE_CACHE_MS ? s : null;
}
