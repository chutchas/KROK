-- ============================================================
-- KROK · 0053_error_events
-- บันทึก error จาก production (server + browser) ไว้ในฐานข้อมูลเราเอง — ไม่ส่งให้บริการภายนอก
-- ดูได้ที่ /admin/errors (Platform Admin) · เก็บ 30 วัน (cron cleanup ลบเก่าทิ้ง)
-- ไม่เก็บ query string / header / ข้อมูลฟอร์ม — เก็บแค่ path, ข้อความ error, stack และ user id (ถ้ามี)
-- รันซ้ำได้
-- ============================================================

create table if not exists public.error_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  source      text not null check (source in ('server', 'client')),
  kind        text,            -- render | route | action | proxy | boundary | window | promise
  path        text,
  message     text not null,
  stack       text,
  digest      text,
  fingerprint text not null,   -- จัดกลุ่ม error เดียวกัน
  user_id     uuid,
  tenant_id   uuid,
  user_agent  text,
  release     text
);
create index if not exists idx_error_events_time on public.error_events(created_at desc);
create index if not exists idx_error_events_fp on public.error_events(fingerprint, created_at desc);

alter table public.error_events enable row level security;
revoke all on public.error_events from anon, authenticated;
