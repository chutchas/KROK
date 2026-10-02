// ============================================================
// KROK · แสดงค่าวัน/เวลาแบบไทย (ช่อง datetime-local / date / time ของเบราว์เซอร์แสดงตามภาษาเครื่อง)
// ============================================================

export type DtMode = "datetime" | "date" | "time";

/** ค่าเริ่มต้น (เวลาปัจจุบันของเครื่อง) ตามรูปแบบของ input */
export function dtNowValue(mode: DtMode = "datetime", now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();
  if (mode === "date") return local.slice(0, 10);
  if (mode === "time") return local.slice(11, 16);
  return local.slice(0, 16);
}

/** "2026-10-02T22:47" → "2 ต.ค. 2569 22:47" (date / time ตามโหมด) · อ่านไม่ได้ = คืนค่าเดิม */
export function formatDtThai(v: string | undefined | null, mode: DtMode = "datetime", lang: "th" | "en" = "th"): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const loc = lang === "en" ? "en-GB" : "th-TH";
  if (mode === "time") {
    const m = /^(\d{2}):(\d{2})/.exec(s);
    return m ? `${m[1]}:${m[2]}${lang === "th" ? " น." : ""}` : s;
  }
  const d = new Date(mode === "date" ? `${s.slice(0, 10)}T00:00` : s);
  if (Number.isNaN(d.getTime())) return s;
  const date = d.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
  if (mode === "date") return date;
  const time = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}${lang === "th" ? " น." : ""}`;
}
