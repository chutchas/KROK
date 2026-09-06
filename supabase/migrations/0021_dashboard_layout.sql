-- 0021_dashboard_layout.sql
-- เก็บ layout widget ของ dashboard ราย "ผู้ใช้ + workspace" (ตามตัวทุกอุปกรณ์)
-- widgets jsonb ตัวอย่าง:
-- [{"id":"w1","format":"stat","formId":"all","metric":"usage","range":"7d"}, ...]
create table if not exists public.dashboard_layouts (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  widgets jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

alter table public.dashboard_layouts enable row level security;

-- ผู้ใช้เห็น/แก้ได้เฉพาะ layout ของตัวเองเท่านั้น
drop policy if exists dashboard_layouts_owner on public.dashboard_layouts;
create policy dashboard_layouts_owner on public.dashboard_layouts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
