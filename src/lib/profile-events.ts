// ============================================================
// KROK · แจ้งชื่อผู้ใช้ใหม่ไปยังแถบบนทันทีหลังบันทึกโปรไฟล์ (ไม่ต้องรอโหลดหน้าใหม่)
// ============================================================
export const PROFILE_NAME_EVENT = "krok:profile-name";

export function emitProfileName(name: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(PROFILE_NAME_EVENT, { detail: name }));
}

export const PROFILE_AVATAR_EVENT = "krok:profile-avatar";
export function emitProfileAvatar(url: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(PROFILE_AVATAR_EVENT, { detail: url }));
}

/** ชื่อแรก (ตัดนามสกุลออก) สำหรับแสดงในที่แคบ */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}
