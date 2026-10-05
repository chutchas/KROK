-- ============================================================
-- KROK · 0067_web_push
-- แจ้งเตือนเด้งบนมือถือ/คอม (Web Push) — ใช้แจ้งเตือนชุดเดียวกับกระดิ่งในแอป
--   notifications (แถวใหม่) → trigger → pg_net ยิง /api/push/dispatch (ไม่รอผล ไม่ถ่วงงานที่สร้างแจ้งเตือน)
--   → server ส่ง push ไปทุกเครื่องที่ผู้ใช้เปิดไว้ (ยกเว้นประเภทที่ปิด)
-- push_subscriptions: 1 แถวต่อเครื่อง/เบราว์เซอร์ · ผู้ใช้เห็น/ลบได้เฉพาะของตัวเอง
-- push_prefs: ประเภทที่ผู้ใช้ปิดไว้
-- push_config: URL ปลายทาง + รหัสยืนยัน (แอปตั้งให้เองตอนมีคนเปิดแจ้งเตือนครั้งแรก · อ่านได้เฉพาะ service role)
-- ต้องเปิด extension pg_net (Database › Extensions) · ไม่มี = แจ้งเตือนในแอปทำงานปกติ แต่ไม่เด้ง
-- รันซ้ำได้ · ต้องรันหลัง 0066
-- ============================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  ua          text not null default '' check (char_length(ua) <= 200),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  fail_count  int not null default 0
);
create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.push_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  off_types  text[] not null default '{}' check (cardinality(off_types) <= 30),
  updated_at timestamptz not null default now()
);
alter table public.push_prefs enable row level security;
revoke all on public.push_prefs from anon, authenticated;
grant select, insert, update on public.push_prefs to authenticated;
drop policy if exists push_prefs_own on public.push_prefs;
create policy push_prefs_own on public.push_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.push_config (
  id          boolean primary key default true check (id),
  dispatch_url text not null,
  secret      text not null,
  updated_at  timestamptz not null default now()
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net ไม่พร้อมใช้ (%): เปิดที่ Database › Extensions แล้วรันไฟล์นี้ซ้ำ', sqlerrm;
end $$;

-- แจ้งเตือนใหม่ → ยิงไปให้ server ส่ง push (เฉพาะผู้ใช้ที่มีเครื่องเปิดไว้)
create or replace function public.notifications_push()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  if not exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id) then return null; end if;
  select dispatch_url, secret into c from public.push_config where id;
  if c.dispatch_url is null then return null; end if;
  begin
    perform net.http_post(
      url := c.dispatch_url,
      body := jsonb_build_object('id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', c.secret),
      timeout_milliseconds := 8000
    );
  exception when others then
    -- pg_net ไม่พร้อม = ข้าม (แจ้งเตือนในแอปยังอยู่)
    null;
  end;
  return null;
end $$;
revoke all on function public.notifications_push() from public, anon, authenticated;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.notifications_push();
