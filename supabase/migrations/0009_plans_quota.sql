-- ============================================================
-- KROK · 0009_plans_quota  (Group C)
-- - แผนสมาชิก (plan) ต่อ workspace: free | pro | business
-- - โควตาการใช้ AI ต่อเดือน (นับใน tenant_usage)
-- - ยังไม่ผูกการจ่ายเงินจริง — เปลี่ยนแผนได้เลย (owner เท่านั้น)
-- ============================================================

alter table public.tenants
  add column if not exists plan text not null default 'free';

-- ---------- การใช้งาน AI ต่อเดือน ----------
create table if not exists public.tenant_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period    text not null,                       -- 'YYYY-MM'
  ai_calls  int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, period)
);

alter table public.tenant_usage enable row level security;

drop policy if exists usage_select on public.tenant_usage;
create policy usage_select on public.tenant_usage
  for select using (tenant_id in (select public.my_tenant_ids()));
-- เขียนผ่าน RPC (security definer) เท่านั้น — ไม่มี policy insert/update ตรง

-- ============================================================
-- RPC: อ่านจำนวนครั้งที่ใช้ AI ในงวดนี้
-- ============================================================
create or replace function public.ai_usage_get(p_tenant uuid, p_period text)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select ai_calls from public.tenant_usage
      where tenant_id = p_tenant and period = p_period), 0)
  where p_tenant in (select public.my_tenant_ids());
$$;

-- ============================================================
-- RPC: เพิ่มตัวนับ AI ของงวดนี้ 1 ครั้ง แล้วคืนค่าล่าสุด
-- (ตรวจว่าเป็นสมาชิก tenant จริงก่อน)
-- ============================================================
create or replace function public.ai_usage_incr(p_tenant uuid, p_period text)
returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_tenant not in (select public.my_tenant_ids()) then
    raise exception 'forbidden';
  end if;
  insert into public.tenant_usage (tenant_id, period, ai_calls, updated_at)
    values (p_tenant, p_period, 1, now())
  on conflict (tenant_id, period)
    do update set ai_calls = public.tenant_usage.ai_calls + 1, updated_at = now()
  returning ai_calls into v;
  return v;
end $$;

-- ============================================================
-- RPC: เปลี่ยนแผน (เฉพาะ owner ของ workspace)
-- ============================================================
create or replace function public.set_plan(p_tenant uuid, p_plan text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role(p_tenant) <> 'owner' then
    raise exception 'เฉพาะ owner เปลี่ยนแผนได้';
  end if;
  if p_plan not in ('free','pro','business') then
    raise exception 'แผนไม่ถูกต้อง';
  end if;
  update public.tenants set plan = p_plan where id = p_tenant;
end $$;
