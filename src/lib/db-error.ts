// ============================================================
// ข้อความ error จากฐานข้อมูล → ข้อความที่แสดงผู้ใช้ได้
// - ข้อความภาษาไทย (raise exception ที่เราเขียนเอง) / โควตา [quota:…] = ตั้งใจให้ผู้ใช้เห็น → ส่งต่อ
// - error ดิบของ Postgres/PostgREST (ชื่อตาราง/constraint/คอลัมน์) → ข้อความทั่วไป + เก็บของจริงใน log
// ============================================================
type DbErr = { message?: string; code?: string } | null | undefined;

export function dbError(e: DbErr, fallback = "ทำรายการไม่สำเร็จ โปรดลองใหม่"): string {
  const m = e?.message ?? "";
  if (/[฀-๿]/.test(m) || /\[quota:[a-z_]+\]/.test(m)) return m;
  if (e?.code === "23505") return "ข้อมูลนี้มีอยู่แล้ว";
  if (e?.code === "42501") return "ไม่มีสิทธิ์ทำรายการนี้";
  console.error("[krok] db error:", e?.code ?? "", m);
  return fallback;
}
