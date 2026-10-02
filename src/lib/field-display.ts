// ============================================================
// KROK · ข้อความที่เก็บ/แสดงของคำตอบ (ใช้ร่วม: หน้ากรอก / ฟอร์มสาธารณะ)
// ============================================================
import type { FormField } from "@/lib/form-schema";

export const NA_TEXT = "ไม่เกี่ยวข้อง";

/** ผล ผ่าน/ไม่ผ่าน/N/A → ข้อความในเอกสาร (ใช้คำที่ตั้งไว้ในฟอร์ม) */
export function pfDisplay(f: Pick<FormField, "pass_label" | "fail_label">, code: unknown): string {
  if (code === "pass") return f.pass_label?.trim() || "ผ่าน";
  if (code === "fail") return f.fail_label?.trim() || "ไม่ผ่าน";
  if (code === "na") return NA_TEXT;
  return "—";
}

/** ข้อความในเอกสาร → รหัสผล (รับทั้งคำมาตรฐานและคำที่ตั้งไว้) */
export function pfCodeOf(f: Pick<FormField, "pass_label" | "fail_label" | "allow_na">, display: unknown): "pass" | "fail" | "na" | "" {
  const d = typeof display === "string" ? display.trim() : "";
  if (!d) return "";
  if (d === "ไม่ผ่าน" || d === f.fail_label?.trim()) return "fail";
  if (d === "ผ่าน" || d === f.pass_label?.trim()) return "pass";
  if (f.allow_na && d === NA_TEXT) return "na";
  return "";
}
