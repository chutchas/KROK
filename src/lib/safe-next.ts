// ============================================================
// ?next= หลังเข้าสู่ระบบ: รับเฉพาะ path ภายในเว็บนี้ (กัน open redirect)
// ตรวจด้วยการแยก URL จริงแล้วเทียบ origin — regex อย่างเดียวหลุดได้ (เช่น "/\t/evil.com" ที่เบราว์เซอร์ตัด tab ทิ้ง)
// ============================================================
const BASE = "https://krok.invalid";

export function safeNextPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || raw[0] !== "/" || raw.length > 2048) return fallback;
  // อักขระควบคุม/ช่องว่าง/backslash = ไม่รับเลย (เบราว์เซอร์ตีความต่างกัน)
  if (/[\u0000-\u001f\u007f\\\s]/.test(raw)) return fallback;
  try {
    const u = new URL(raw, BASE);
    if (u.origin !== BASE) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
