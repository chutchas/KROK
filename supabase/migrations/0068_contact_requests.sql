-- ============================================================
-- KROK · 0068_contact_requests
-- ข้อความจากหน้า "ติดต่อเรา" (/contact) — ไม่ต้องล็อกอิน
--   server รับผ่าน /api/public/contact (service role) แล้วส่งอีเมลถึงทีมขาย
--   เก็บลงตารางด้วย: อีเมลส่งไม่ออก/ถูกกรองทิ้ง ข้อมูลลูกค้าก็ไม่หาย (ดูได้ที่ Admin › ลูกค้าติดต่อ)
-- อ่าน/เขียนได้เฉพาะ service role · ip เก็บเป็น hash (ใช้จำกัดจำนวนครั้ง ไม่เก็บ IP จริง)
-- ลบอัตโนมัติไม่มี — ลบเองได้จากหน้าแอดมิน
-- รันซ้ำได้ · ต้องรันหลัง 0067
-- ============================================================

create table if not exists public.contact_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 120),
  company     text not null default '' check (char_length(company) <= 160),
  email       text not null check (char_length(email) <= 200),
  phone       text not null default '' check (char_length(phone) <= 40),
  seats       text not null default '' check (char_length(seats) <= 40),
  message     text not null check (char_length(message) between 1 and 4000),
  lang        text not null default 'th',
  ip_hash     text not null default '',
  emailed     boolean not null default false,
  email_error text,
  handled_at  timestamptz,
  handled_by  uuid references auth.users(id) on delete set null
);
create index if not exists idx_contact_requests_time on public.contact_requests(created_at desc);
create index if not exists idx_contact_requests_ip on public.contact_requests(ip_hash, created_at desc);

alter table public.contact_requests enable row level security;
revoke all on public.contact_requests from anon, authenticated;
