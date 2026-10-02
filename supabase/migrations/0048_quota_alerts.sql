-- ============================================================
-- KROK · 0048_quota_alerts
-- แจ้งเตือนเจ้าของบัญชีเมื่อโควตาใช้ถึง 80% / 100% (cron รายวัน) — แจ้งครั้งเดียวต่อโควตา/ระดับ/เดือน
-- รันซ้ำได้ · ต้องรัน 0045 ก่อน
-- ============================================================

create table if not exists public.quota_alerts (
  user_id    uuid not null references auth.users(id) on delete cascade,
  metric     text not null,
  level      int  not null check (level in (80, 100)),
  period     text not null,            -- YYYY-MM
  created_at timestamptz not null default now(),
  primary key (user_id, metric, level, period)
);
alter table public.quota_alerts enable row level security;
revoke all on public.quota_alerts from anon, authenticated;

-- เจ้าของบัญชีทุกคน + workspace ตัวแทน 1 อัน (ใช้คำนวณยอดรวมของกลุ่ม)
create or replace function public.billing_owner_tenants()
returns table (owner uuid, tenant uuid)
language sql stable security definer set search_path = public as $$
  select distinct on (o.owner) o.owner, o.id
    from (select t.id, t.created_at, public.tenant_billing_owner(t.id) as owner from public.tenants t) o
   where o.owner is not null
   order by o.owner, o.created_at;
$$;
revoke all on function public.billing_owner_tenants() from public, anon, authenticated;
grant execute on function public.billing_owner_tenants() to service_role;
