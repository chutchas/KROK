-- ============================================================
-- KROK · 0042_intake_key_expiry
-- API key รับข้อมูลเข้า: กำหนดวันหมดอายุได้ (null = ไม่หมดอายุ)
-- key ที่หมดอายุแล้ว API ตอบ 401 { code: "key_expired" } จนกว่าจะสร้าง key ใหม่หรือต่ออายุ
-- ============================================================
alter table public.form_intake
  add column if not exists key_expires_at timestamptz;
