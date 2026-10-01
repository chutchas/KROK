-- ============================================================
-- KROK · 0043_integrations_hardening
-- 1) ความลับ (LINE token / SMTP password / webhook secret) ไม่ให้อ่านผ่าน REST อีก
--    → ทุกการอ่าน/เขียน tenant_notify + webhooks ทำฝั่ง server (service role) หลังตรวจสิทธิ์แล้ว
-- 2) LINE: ไม่ใส่ผู้รับ = ไม่ broadcast เอง ต้องติ๊ก "ส่งถึงผู้ติดตามทั้งหมด" (line_broadcast)
--    ของเดิมที่ปล่อยว่างและเปิดใช้อยู่ = ตั้ง line_broadcast ให้ เพื่อทำงานเหมือนเดิม
-- 3) submissions.notified_at — กันแจ้งเตือน/webhook ซ้ำเมื่อ client เรียกซ้ำ (ออฟไลน์ซิงก์/กดซ้ำ)
-- 4) webhook_deliveries — ประวัติการส่ง webhook แต่ละครั้ง (เก็บ 30 วัน)
-- รันซ้ำได้
-- ============================================================

-- 1) ปิดการเข้าถึงตรงจาก client (server ใช้ service role ซึ่งไม่ถูกกระทบ)
revoke all on public.tenant_notify from anon, authenticated;
revoke all on public.webhooks from anon, authenticated;

-- 2) LINE broadcast ต้องเลือกเอง
alter table public.tenant_notify add column if not exists line_broadcast boolean not null default false;
update public.tenant_notify
   set line_broadcast = true
 where line_enabled and coalesce(btrim(line_target), '') = '' and not line_broadcast;

-- 3) กันแจ้งซ้ำ
alter table public.submissions add column if not exists notified_at timestamptz;

create or replace function public.zz_guard_submission_notified()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and new.notified_at is distinct from old.notified_at then
    raise exception 'notified_at is server-managed';
  end if;
  return new;
end $$;

drop trigger if exists zz_guard_submission_notified on public.submissions;
create trigger zz_guard_submission_notified
  before update on public.submissions
  for each row execute function public.zz_guard_submission_notified();

-- 4) ประวัติการส่ง webhook
create table if not exists public.webhook_deliveries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  webhook_id  uuid not null references public.webhooks(id) on delete cascade,
  event       text not null,
  status      int,                 -- HTTP status ล่าสุด (null = ต่อไม่ติด)
  ok          boolean not null default false,
  attempts    int not null default 1,
  error       text,
  duration_ms int,
  created_at  timestamptz not null default now()
);
create index if not exists idx_webhook_deliveries_hook on public.webhook_deliveries(webhook_id, created_at desc);
create index if not exists idx_webhook_deliveries_created on public.webhook_deliveries(created_at);

alter table public.webhook_deliveries enable row level security;
revoke all on public.webhook_deliveries from anon, authenticated;
