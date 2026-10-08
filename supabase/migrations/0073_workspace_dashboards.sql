-- ============================================================
-- KROK · 0073_workspace_dashboards
-- Dashboard ของ workspace (1 ชุดต่อ workspace) — owner/admin จัด · สมาชิกทุกคนเห็นเป็นหลัก
--   · dashboard_layouts (0021) ยังเป็น "ของฉัน" ของแต่ละคนเหมือนเดิม
--   · ค่าของ widget คำนวณด้วยสิทธิ์ของคนที่ดู (dashboard_metrics เป็น security invoker + RLS 0054)
--     → สมาชิกเห็นเฉพาะข้อมูลของฟอร์มที่ตัวเองมีสิทธิ์ · widget ที่ผูกฟอร์มที่มองไม่เห็นถูกซ่อนที่หน้าจอ
--   · ชุดเริ่มต้น = layout ส่วนตัวของเจ้าของ workspace (ถ้ามี)
-- รันซ้ำได้ · ต้องรันหลัง 0072 · โค้ดแอปทำงานได้ก่อนรัน (แท็บ Workspace ว่าง แก้ไม่ได้)
-- ============================================================

create table if not exists public.workspace_dashboards (
  tenant_id  uuid primary key references public.tenants(id) on delete cascade,
  widgets    jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint workspace_dashboards_widgets_array check (jsonb_typeof(widgets) = 'array' and jsonb_array_length(widgets) <= 30)
);

-- เจ้าของ/แอดมินของ workspace (designer จัดฟอร์มได้ แต่ไม่จัดหน้ารวมของทั้ง workspace)
create or replace function public.is_ws_admin(t uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
     where user_id = auth.uid() and tenant_id = t and role in ('owner', 'admin')
  )
$$;
revoke all on function public.is_ws_admin(uuid) from public, anon;
grant execute on function public.is_ws_admin(uuid) to authenticated, service_role;

create or replace function public.workspace_dashboards_stamp()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then raise exception 'ย้าย dashboard ข้าม workspace ไม่ได้'; end if;
  return new;
end $$;
drop trigger if exists workspace_dashboards_stamp on public.workspace_dashboards;
create trigger workspace_dashboards_stamp before insert or update on public.workspace_dashboards
  for each row execute function public.workspace_dashboards_stamp();

alter table public.workspace_dashboards enable row level security;
revoke all on public.workspace_dashboards from anon;
grant select, insert, update on public.workspace_dashboards to authenticated;

drop policy if exists wdash_select on public.workspace_dashboards;
create policy wdash_select on public.workspace_dashboards
  for select using (tenant_id in (select public.my_tenant_ids()));

drop policy if exists wdash_insert on public.workspace_dashboards;
create policy wdash_insert on public.workspace_dashboards
  for insert with check (public.is_ws_admin(tenant_id));

drop policy if exists wdash_update on public.workspace_dashboards;
create policy wdash_update on public.workspace_dashboards
  for update using (public.is_ws_admin(tenant_id)) with check (public.is_ws_admin(tenant_id));

drop policy if exists krok_mfa_required on public.workspace_dashboards;
create policy krok_mfa_required on public.workspace_dashboards as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- ชุดเริ่มต้น: layout ส่วนตัวของเจ้าของ workspace (คนสร้างถ้ายังเป็น owner · ไม่งั้น owner ที่เข้าร่วมก่อนสุด)
-- ไม่เขียนทับ workspace ที่มีชุดของตัวเองแล้ว
insert into public.workspace_dashboards (tenant_id, widgets, updated_by)
select l.tenant_id, l.widgets, l.user_id
  from public.dashboard_layouts l
  join public.tenants t on t.id = l.tenant_id
 where jsonb_typeof(l.widgets) = 'array'
   and jsonb_array_length(l.widgets) between 1 and 30
   and l.user_id = coalesce(
         (select t.created_by where exists (select 1 from public.memberships m
                                             where m.tenant_id = t.id and m.user_id = t.created_by and m.role = 'owner')),
         (select m.user_id from public.memberships m where m.tenant_id = t.id and m.role = 'owner' order by m.created_at limit 1))
on conflict (tenant_id) do nothing;
