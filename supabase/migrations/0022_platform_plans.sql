-- 0022_platform_plans.sql
-- ตั้งค่าราคา + โควตาของแต่ละแพ็กเกจ ระดับแพลตฟอร์ม (singleton)
-- plans jsonb ตัวอย่าง (เก็บเฉพาะค่าที่ override ทับค่า default ในโค้ด):
-- {
--   "pro": {"priceThb": 990, "maxForms": 25, "aiCreditsPerMonth": 500, "maxMembers": 20, "maxWorkspaces": 3}
-- }
create table if not exists public.platform_plan_settings (
  id boolean primary key default true,
  plans jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint platform_plan_singleton check (id)
);

alter table public.platform_plan_settings enable row level security;

-- ราคา/โควตาไม่ใช่ความลับ — ให้ผู้ใช้ที่ล็อกอินอ่านได้ (ใช้แสดงหน้าแผน/โควตา)
drop policy if exists platform_plan_read on public.platform_plan_settings;
create policy platform_plan_read on public.platform_plan_settings
  for select to authenticated using (true);
-- การเขียนทำผ่าน service-role เท่านั้น (ไม่มี policy insert/update/delete)

insert into public.platform_plan_settings (id, plans)
  values (true, '{}'::jsonb)
  on conflict (id) do nothing;
