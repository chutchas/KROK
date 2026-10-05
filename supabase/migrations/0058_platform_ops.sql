-- ============================================================
-- KROK · 0058_platform_ops
-- ข้อมูลสำหรับหน้า Platform Admin: Health + ยอดขาย/ต้นทุน
--  1) ai_token_usage   — token จริงของทุกการเรียก AI (เริ่มเก็บตั้งแต่ migration นี้)
--  2) platform_ai_prices — ราคาต่อ 1 ล้าน token ของแต่ละรุ่น (USD) ตั้งในหน้า admin
--  3) platform_cost_settings — อัตราแลกเปลี่ยน USD→THB + ต้นทุนคงที่ต่อเดือน
--  4) cron_runs         — ผลการรันงานตั้งเวลาครั้งล่าสุด (หน้า Health ใช้ดูว่างานยังรันอยู่ไหม)
--  5) platform_health() — สถานะ migration / ค่าตั้ง pre-request (อ่านจาก service role)
-- ทุกตารางอ่าน/เขียนได้เฉพาะ service role (หน้าเว็บตรวจ platform admin ก่อนใช้)
-- รันซ้ำได้ · ต้องรันหลัง 0057
-- ============================================================

create table if not exists public.ai_token_usage (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  tenant_id     uuid references public.tenants(id) on delete set null,
  purpose       text not null,
  provider      text not null,
  model         text not null,
  input_tokens  int not null default 0,
  output_tokens int not null default 0
);
create index if not exists idx_ai_token_usage_at on public.ai_token_usage(at desc);
create index if not exists idx_ai_token_usage_tenant on public.ai_token_usage(tenant_id, at desc);
alter table public.ai_token_usage enable row level security;
revoke all on public.ai_token_usage from anon, authenticated;

create table if not exists public.platform_ai_prices (
  model         text primary key,
  input_per_m   numeric(12,4) not null default 0,   -- USD ต่อ 1,000,000 token ขาเข้า
  output_per_m  numeric(12,4) not null default 0,   -- USD ต่อ 1,000,000 token ขาออก
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);
alter table public.platform_ai_prices enable row level security;
revoke all on public.platform_ai_prices from anon, authenticated;

create table if not exists public.platform_cost_settings (
  id                 boolean primary key default true check (id),
  usd_thb            numeric(10,4) not null default 35,
  fixed_monthly_thb  numeric(12,2) not null default 0,   -- เช่น Vercel + Supabase + โดเมน
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null
);
insert into public.platform_cost_settings (id) values (true) on conflict (id) do nothing;
alter table public.platform_cost_settings enable row level security;
revoke all on public.platform_cost_settings from anon, authenticated;

create table if not exists public.cron_runs (
  job        text primary key,
  last_at    timestamptz not null default now(),
  ok         boolean not null default true,
  note       text
);
alter table public.cron_runs enable row level security;
revoke all on public.cron_runs from anon, authenticated;

-- token usage ไม่ลบอัตโนมัติ (ใช้ดูต้นทุนย้อนหลัง) — ปริมาณต่อเดือนหลักหมื่นแถว

-- สถานะฐานข้อมูลสำหรับหน้า Health (service role เท่านั้น)
create or replace function public.platform_health()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare r jsonb;
begin
  select jsonb_build_object(
    'm0050', exists(select 1 from information_schema.columns where table_schema='public' and table_name='forms' and column_name='summary'),
    'm0051', coalesce((select is_nullable='YES' from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='tenant_id'), false),
    'm0052', to_regprocedure('public.ai_usage_incr_by(uuid,text,text)') is not null
             and not has_function_privilege('authenticated','public.ai_usage_incr_by(uuid,text,text)','execute'),
    'm0053', to_regclass('public.error_events') is not null,
    'm0054', to_regprocedure('public.my_visible_form_ids()') is not null,
    'm0055', to_regprocedure('public.mfa_ok()') is not null,
    'm0056', to_regclass('public.tenant_branding') is not null,
    'm0057', to_regprocedure('public.krok_pre_request()') is not null,
    'm0058', true,
    'pre_request', coalesce((select array_to_string(rolconfig, ' ') like '%pgrst.db_pre_request=public.krok_pre_request%'
                              from pg_roles where rolname = 'authenticator'), false),
    'db_size_bytes', pg_database_size(current_database()),
    'tenants', (select count(*) from public.tenants),
    'users', (select count(*) from auth.users),
    'submissions_24h', (select count(*) from public.submissions where submitted_at > now() - interval '1 day')
  ) into r;
  return r;
end $$;
revoke all on function public.platform_health() from public, anon, authenticated;
grant execute on function public.platform_health() to service_role;

-- สรุป token ต่อเดือน (เวลาไทย) × งาน × ผู้ให้บริการ × รุ่น × workspace (service role เท่านั้น)
create or replace function public.platform_ai_usage(p_from timestamptz, p_to timestamptz)
returns table (month text, purpose text, provider text, model text, tenant_id uuid, calls bigint, input_tokens bigint, output_tokens bigint)
language sql stable security definer
set search_path = public
as $$
  select to_char(at at time zone 'Asia/Bangkok', 'YYYY-MM'), purpose, provider, model, tenant_id,
         count(*), coalesce(sum(input_tokens), 0), coalesce(sum(output_tokens), 0)
    from public.ai_token_usage
   where at >= p_from and at < p_to
   group by 1, 2, 3, 4, 5
$$;
revoke all on function public.platform_ai_usage(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.platform_ai_usage(timestamptz, timestamptz) to service_role;
