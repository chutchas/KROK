-- ============================================================
-- KROK · 0069_contact_requests_user
-- ฟอร์ม "ติดต่อเรา" ใช้ได้จากในแอปด้วย (เมนูโปรไฟล์ › ติดต่อทีม KROK)
--   topic     = ประเภทเรื่อง (usage · billing · feature · other) — ว่าง = ไม่ระบุ
--   user_id   = ผู้ใช้ที่ล็อกอินอยู่ตอนส่ง (ว่าง = คนนอก)
--   tenant_id = workspace ที่ active ตอนส่ง
-- ยังไม่รัน = ฟอร์มยังใช้ได้ (บันทึกแบบเดิม ไม่มี 3 ช่องนี้)
-- รันซ้ำได้ · ต้องรันหลัง 0068
-- ============================================================

alter table public.contact_requests
  add column if not exists topic text not null default '' check (topic in ('', 'usage', 'billing', 'feature', 'other')),
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null;

create index if not exists idx_contact_requests_user on public.contact_requests(user_id, created_at desc) where user_id is not null;
