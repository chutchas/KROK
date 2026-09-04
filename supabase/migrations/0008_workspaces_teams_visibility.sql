-- ============================================================
-- KROK · 0008_workspaces_teams_visibility  (Group B)
-- - Multi-workspace: ผู้ใช้เป็นสมาชิกได้หลาย tenant อยู่แล้ว (memberships)
--   เพิ่ม RPC ให้สร้าง workspace ใหม่เองได้
-- - Team/Section ภายใน workspace
-- - สิทธิ์เห็นฟอร์ม (visibility): all | teams | users
-- ============================================================

-- ---------- teams / sections ----------
create table if not exists public.teams (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_teams_tenant on public.teams(tenant_id);

create table if not exists public.team_members (
  team_id   uuid not null references public.teams(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  primary key (team_id, user_id)
);
create index if not exists idx_team_members_user on public.team_members(user_id);

-- ---------- forms: visibility ----------
alter table public.forms
  add column if not exists visibility     text not null default 'all',   -- all | teams | users
  add column if not exists visible_teams  jsonb not null default '[]'::jsonb,  -- team ids
  add column if not exists visible_users  jsonb not null default '[]'::jsonb;  -- user ids

-- ============================================================
-- helper: team ids ที่ผู้ใช้ปัจจุบันอยู่ (ทุก tenant)
-- ============================================================
create or replace function public.my_team_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.team_members where user_id = auth.uid()
$$;

-- ============================================================
-- RLS: teams / team_members
-- ============================================================
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select using (tenant_id in (select public.my_tenant_ids()));

drop policy if exists teams_manage on public.teams;
create policy teams_manage on public.teams
  for all using (public.can_manage(tenant_id)) with check (public.can_manage(tenant_id));

drop policy if exists tm_select on public.team_members;
create policy tm_select on public.team_members
  for select using (tenant_id in (select public.my_tenant_ids()));

drop policy if exists tm_manage on public.team_members;
create policy tm_manage on public.team_members
  for all using (public.can_manage(tenant_id)) with check (public.can_manage(tenant_id));

-- ============================================================
-- RPC: สร้าง workspace ใหม่ (ผู้ใช้ที่ล็อกอินเป็น owner ของ workspace ใหม่)
-- ============================================================
create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_tenant uuid;
  disp text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'ต้องระบุชื่อ workspace'; end if;

  insert into public.tenants (name, created_by) values (trim(p_name), auth.uid())
    returning id into new_tenant;

  select coalesce(nullif(name,''), nullif(email,'')) into disp
    from public.memberships where user_id = auth.uid() limit 1;

  insert into public.memberships (tenant_id, user_id, role, name, email)
    values (new_tenant, auth.uid(), 'owner', disp,
            (select email from public.memberships where user_id = auth.uid() limit 1));
  return new_tenant;
end $$;
