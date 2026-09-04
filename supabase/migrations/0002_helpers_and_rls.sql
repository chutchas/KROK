-- ============================================================
-- KROK · 0002_helpers_and_rls
-- helper functions + auto-provision tenant on signup + RLS policies
-- ============================================================

-- ---------- helper: tenant ids ที่ user เป็นสมาชิก ----------
-- SECURITY DEFINER + STABLE เพื่อเลี่ยง recursion ใน policy ของ memberships
create or replace function public.my_tenant_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from public.memberships where user_id = auth.uid()
$$;

-- ---------- helper: role ของ user ใน tenant หนึ่ง ----------
create or replace function public.my_role(t uuid)
returns membership_role
language sql stable security definer set search_path = public as $$
  select role from public.memberships where user_id = auth.uid() and tenant_id = t
$$;

-- ---------- helper: เป็น admin/owner ของ tenant ไหม ----------
create or replace function public.can_manage(t uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and tenant_id = t and role in ('owner','admin','designer')
  )
$$;

-- ============================================================
-- auto-provision: สมัครใหม่ → สร้าง tenant + owner membership ให้
-- (Phase 1: 1 signup = 1 องค์กร; เชิญคนเพิ่มทีหลังได้ใน Phase 2)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_tenant uuid;
  org_name   text;
begin
  org_name := coalesce(nullif(new.raw_user_meta_data->>'org_name',''),
                       split_part(new.email,'@',1) || ' Workspace');
  insert into public.tenants (name, created_by) values (org_name, new.id)
    returning id into new_tenant;
  insert into public.memberships (tenant_id, user_id, role)
    values (new_tenant, new.id, 'owner');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS
-- ============================================================
alter table public.tenants            enable row level security;
alter table public.memberships        enable row level security;
alter table public.forms              enable row level security;
alter table public.submissions        enable row level security;
alter table public.submission_photos  enable row level security;
alter table public.audit_log          enable row level security;

-- ---- tenants ----
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select using (id in (select public.my_tenant_ids()));

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants
  for update using (public.my_role(id) = 'owner');

-- ---- memberships ----
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select using (tenant_id in (select public.my_tenant_ids()));

drop policy if exists memberships_manage on public.memberships;
create policy memberships_manage on public.memberships
  for all using (public.my_role(tenant_id) in ('owner','admin'))
  with check (public.my_role(tenant_id) in ('owner','admin'));

-- ---- forms ----
drop policy if exists forms_select on public.forms;
create policy forms_select on public.forms
  for select using (tenant_id in (select public.my_tenant_ids()));

drop policy if exists forms_write on public.forms;
create policy forms_write on public.forms
  for all using (public.can_manage(tenant_id))
  with check (public.can_manage(tenant_id));

-- ---- submissions ----
-- ทุกสมาชิก tenant กรอกได้; อ่านได้ทั้ง tenant
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions
  for select using (tenant_id in (select public.my_tenant_ids()));

drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions
  for insert with check (
    tenant_id in (select public.my_tenant_ids())
    and submitted_by = auth.uid()
  );

-- ---- submission_photos ----
drop policy if exists photos_select on public.submission_photos;
create policy photos_select on public.submission_photos
  for select using (tenant_id in (select public.my_tenant_ids()));

drop policy if exists photos_insert on public.submission_photos;
create policy photos_insert on public.submission_photos
  for insert with check (tenant_id in (select public.my_tenant_ids()));

-- ---- audit_log ----
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select using (
    tenant_id in (select public.my_tenant_ids())
    and public.can_manage(tenant_id)
  );

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert with check (tenant_id in (select public.my_tenant_ids()));

-- realtime: ให้ dashboard subscribe submissions ได้
alter publication supabase_realtime add table public.submissions;
