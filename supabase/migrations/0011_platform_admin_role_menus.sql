-- ============================================================
-- KROK · 0011_platform_roles_and_workspace_roles
-- - Platform role 3 ระดับ: platform_admin | developer | user
-- - Workspace: role กำหนดเองต่อ workspace (tenant_roles) + สิทธิ์เข้าถึงเมนู
--   role เดิม (enum owner/admin/operator) ยังทำงานเป็นชั้นความปลอดภัยข้างใต้
--   memberships.role_key = role จริงที่แสดง/คุมเมนู; enum sync ตาม can_manage
-- ============================================================

-- ---------- platform role ----------
alter table public.profiles
  add column if not exists platform_role text not null default 'user'
    check (platform_role in ('platform_admin','developer','user'));

update public.profiles
  set platform_role = 'platform_admin'
  where user_id = (select id from auth.users where lower(email) = 'chutchatum@gmail.com');

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select platform_role = 'platform_admin' from public.profiles where user_id = auth.uid()), false)
$$;

drop policy if exists profiles_platform_admin on public.profiles;
create policy profiles_platform_admin on public.profiles
  for select using (public.is_platform_admin());

-- ============================================================
-- tenant_roles — role ต่อ workspace (ตั้งชื่อเอง + คุมเมนู + ธงจัดการ)
-- ============================================================
create table if not exists public.tenant_roles (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  key        text not null,                        -- slug ไม่ซ้ำใน tenant
  name       text not null,
  can_manage boolean not null default false,       -- จัดการ workspace ได้ไหม
  menus      jsonb not null default '[]'::jsonb,   -- ["forms","dashboard",...]
  is_system  boolean not null default false,       -- owner/user ลบไม่ได้
  sort       int not null default 100,
  created_at timestamptz not null default now(),
  unique (tenant_id, key)
);
create index if not exists idx_tenant_roles_tenant on public.tenant_roles(tenant_id);

alter table public.tenant_roles enable row level security;

drop policy if exists tr_select on public.tenant_roles;
create policy tr_select on public.tenant_roles
  for select using (tenant_id in (select public.my_tenant_ids()));

drop policy if exists tr_manage on public.tenant_roles;
create policy tr_manage on public.tenant_roles
  for all using (public.my_role(tenant_id) in ('owner','admin'))
  with check (public.my_role(tenant_id) in ('owner','admin'));

-- ---------- role_key บน membership ----------
alter table public.memberships
  add column if not exists role_key text;

-- ============================================================
-- seed role มาตรฐานให้ทุก tenant ที่มีอยู่
--   owner (จัดการ, ทุกเมนู) · admin (จัดการ, ทุกเมนู) · user (กรอก+dashboard)
-- ============================================================
do $$
declare
  all_menus jsonb := '["studio","forms","approvals","dashboard","team","billing","integrations","ai"]'::jsonb;
  user_menus jsonb := '["forms","dashboard"]'::jsonb;
begin
  insert into public.tenant_roles (tenant_id, key, name, can_manage, menus, is_system, sort)
    select id, 'owner', 'Owner', true, all_menus, true, 0 from public.tenants
    on conflict (tenant_id, key) do nothing;
  insert into public.tenant_roles (tenant_id, key, name, can_manage, menus, is_system, sort)
    select id, 'admin', 'Admin', true, all_menus, true, 10 from public.tenants
    on conflict (tenant_id, key) do nothing;
  insert into public.tenant_roles (tenant_id, key, name, can_manage, menus, is_system, sort)
    select id, 'user', 'User', false, user_menus, true, 20 from public.tenants
    on conflict (tenant_id, key) do nothing;
end $$;

-- backfill role_key จาก enum เดิม
update public.memberships set role_key = case role
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    when 'designer' then 'admin'
    else 'user' end
  where role_key is null;

-- ============================================================
-- create_workspace: seed role + ตั้ง owner ให้ผู้สร้าง (แทนของเดิมใน 0008)
-- ============================================================
create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_tenant uuid;
  disp text;
  all_menus jsonb := '["studio","forms","approvals","dashboard","team","billing","integrations","ai"]'::jsonb;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'ต้องระบุชื่อ workspace'; end if;

  insert into public.tenants (name, created_by) values (trim(p_name), auth.uid())
    returning id into new_tenant;

  -- role เริ่มต้น 2 ตัว: Owner + User (Admin ไว้เป็นตัวเลือกจัดการเพิ่ม)
  insert into public.tenant_roles (tenant_id, key, name, can_manage, menus, is_system, sort) values
    (new_tenant, 'owner', 'Owner', true, all_menus, true, 0),
    (new_tenant, 'admin', 'Admin', true, all_menus, true, 10),
    (new_tenant, 'user', 'User', false, '["forms","dashboard"]'::jsonb, true, 20);

  select coalesce(nullif(name,''), nullif(email,'')) into disp
    from public.memberships where user_id = auth.uid() limit 1;

  insert into public.memberships (tenant_id, user_id, role, role_key, name, email)
    values (new_tenant, auth.uid(), 'owner', 'owner', disp,
            (select email from public.memberships where user_id = auth.uid() limit 1));
  return new_tenant;
end $$;

-- ============================================================
-- handle_new_user: ตั้ง role_key ตอนรับ invite (enum → key)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  disp text;
  org_name text;
  new_tenant uuid;
  joined int := 0;
  all_menus jsonb := '["studio","forms","approvals","dashboard","team","billing","integrations","ai"]'::jsonb;
begin
  disp := coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1));

  for inv in
    select * from public.invites
    where lower(email) = lower(new.email) and accepted_at is null
  loop
    insert into public.memberships (tenant_id, user_id, role, role_key, email, name)
      values (inv.tenant_id, new.id, inv.role,
              case inv.role when 'owner' then 'owner' when 'admin' then 'admin' when 'designer' then 'admin' else 'user' end,
              new.email, disp)
      on conflict (tenant_id, user_id) do nothing;
    update public.invites set accepted_at = now() where id = inv.id;
    joined := joined + 1;
  end loop;

  if joined = 0 then
    org_name := coalesce(nullif(new.raw_user_meta_data->>'org_name',''), split_part(new.email,'@',1) || ' Workspace');
    insert into public.tenants (name, created_by) values (org_name, new.id) returning id into new_tenant;
    insert into public.tenant_roles (tenant_id, key, name, can_manage, menus, is_system, sort) values
      (new_tenant, 'owner', 'Owner', true, all_menus, true, 0),
      (new_tenant, 'admin', 'Admin', true, all_menus, true, 10),
      (new_tenant, 'user', 'User', false, '["forms","dashboard"]'::jsonb, true, 20);
    insert into public.memberships (tenant_id, user_id, role, role_key, email, name)
      values (new_tenant, new.id, 'owner', 'owner', new.email, disp);
  end if;
  return new;
end $$;
