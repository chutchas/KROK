-- ============================================================
-- KROK · 0072_workspace_areas
-- พื้นที่ (Area) — รายชื่อกลางระดับ workspace + ใบงานที่ยังไม่จบตามพื้นที่
--   · workspace_areas: รหัส (เก็บลงคำตอบ เปลี่ยนไม่ได้) + ชื่อ · ปิดใช้แทนการลบ (เอกสารเก่าอ้างอยู่)
--   · ฟิลด์พื้นที่ในฟอร์ม = select ที่มี "area": true ใน schema (ฟอร์มละ 1 ช่อง) — ค่าที่บันทึก = รหัสพื้นที่
--   · form_cases.area_id / submissions.area_id คำนวณโดย trigger (แอปไม่ต้องส่งมา)
--   · area_open_items(): ใบที่ยังไม่จบ (งานที่เปิดอยู่ + ใบรออนุมัติ) — เตือนอย่างเดียว ไม่บล็อก
-- รันซ้ำได้ · ต้องรันหลัง 0071 · โค้ดแอปทำงานได้ทั้งก่อนและหลังรัน (ก่อนรัน = ไม่มีพื้นที่ให้เลือก)
-- ============================================================

create table if not exists public.workspace_areas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  code       text not null,
  name       text not null,
  sort       int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  -- รหัสถูกเก็บในคำตอบและคั่นด้วย ", " ตอนเลือกหลายข้อ → ห้ามช่องว่าง/จุลภาค
  constraint workspace_areas_code_ok check (code ~ '^[^\s,]{1,20}$'),
  constraint workspace_areas_name_ok check (char_length(btrim(name)) between 1 and 80),
  unique (tenant_id, code)
);
create index if not exists idx_workspace_areas_tenant on public.workspace_areas(tenant_id, sort);

-- รหัสเปลี่ยนไม่ได้ (คำตอบเก่าอ้างด้วยรหัส) · ย้าย workspace ไม่ได้ · จำกัด 200 พื้นที่ต่อ workspace
create or replace function public.workspace_areas_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'UPDATE' then
    if new.code is distinct from old.code then raise exception 'เปลี่ยนรหัสพื้นที่ไม่ได้ (เอกสารเดิมอ้างรหัสนี้อยู่)'; end if;
    if new.tenant_id is distinct from old.tenant_id then raise exception 'ย้ายพื้นที่ข้าม workspace ไม่ได้'; end if;
  elsif (select count(*) from public.workspace_areas where tenant_id = new.tenant_id) >= 200 then
    raise exception 'พื้นที่ครบ 200 รายการแล้ว — ปิดใช้รายการที่ไม่ใช้แทนการเพิ่มใหม่';
  end if;
  return new;
end $$;
drop trigger if exists workspace_areas_guard on public.workspace_areas;
create trigger workspace_areas_guard before insert or update on public.workspace_areas
  for each row execute function public.workspace_areas_guard();

alter table public.workspace_areas enable row level security;
revoke all on public.workspace_areas from anon;
grant select, insert, update on public.workspace_areas to authenticated;  -- ไม่ให้ลบ: ปิดใช้แทน

drop policy if exists warea_select on public.workspace_areas;
create policy warea_select on public.workspace_areas
  for select using (tenant_id in (select public.my_tenant_ids()));

drop policy if exists warea_insert on public.workspace_areas;
create policy warea_insert on public.workspace_areas
  for insert with check (public.can_manage(tenant_id));

drop policy if exists warea_update on public.workspace_areas;
create policy warea_update on public.workspace_areas
  for update using (public.can_manage(tenant_id)) with check (public.can_manage(tenant_id));

-- ============================================================
-- พื้นที่ของงาน / เอกสาร
-- ============================================================
alter table public.form_cases  add column if not exists area_id uuid references public.workspace_areas(id) on delete set null;
alter table public.submissions add column if not exists area_id uuid references public.workspace_areas(id) on delete set null;
create index if not exists idx_cases_area_open on public.form_cases(tenant_id, area_id) where status = 'open' and area_id is not null;
create index if not exists idx_sub_area_pending on public.submissions(tenant_id, area_id) where approval_status = 'pending' and area_id is not null;

-- รหัสพื้นที่ → id (เฉพาะของ workspace นี้)
create or replace function public._area_id_of(p_tenant uuid, p_code text)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.workspace_areas
   where tenant_id = p_tenant and code = nullif(btrim(coalesce(p_code, '')), '')
$$;
revoke all on function public._area_id_of(uuid, text) from public, anon, authenticated;

-- งาน: ช่องที่มี "area": true ใน schema ณ ตอนเริ่มงาน → answers[ช่องนั้น].value = รหัส
create or replace function public.form_cases_area()
returns trigger
language plpgsql security definer set search_path = public as $$
declare fid text;
begin
  select f->>'id' into fid
    from jsonb_array_elements(case when jsonb_typeof(new.schema->'steps') = 'array' then new.schema->'steps' else '[]'::jsonb end) s,
         jsonb_array_elements(case when jsonb_typeof(s->'fields') = 'array' then s->'fields' else '[]'::jsonb end) f
   where f->>'area' = 'true'
   limit 1;
  new.area_id := case when fid is null then null
                      else public._area_id_of(new.tenant_id, new.answers->fid->>'value') end;
  return new;
end $$;
drop trigger if exists form_cases_area on public.form_cases;
create trigger form_cases_area before insert or update of answers, schema on public.form_cases
  for each row execute function public.form_cases_area();

-- เอกสาร: มาจากงาน = ใช้พื้นที่ของงาน · ไม่ใช่ = รายการคำตอบที่ server ติด "area": true (รหัสอยู่ใน code)
create or replace function public.submissions_area()
returns trigger
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if new.case_id is not null then
    select area_id into new.area_id from public.form_cases where id = new.case_id;
    if new.area_id is not null then return new; end if;
  end if;
  select coalesce(a->>'code', a->>'display') into c
    from jsonb_array_elements(case when jsonb_typeof(new.answers) = 'array' then new.answers else '[]'::jsonb end) a
   where a->>'area' = 'true'
   limit 1;
  new.area_id := public._area_id_of(new.tenant_id, c);
  return new;
end $$;
drop trigger if exists submissions_area on public.submissions;
create trigger submissions_area before insert on public.submissions
  for each row execute function public.submissions_area();

-- ============================================================
-- ใบที่ยังไม่จบ ตามพื้นที่ (widget dashboard · กล่องเตือนตอนอนุมัติ)
--   kind = 'case'     งานที่เปิดอยู่ (step_title / holder = ขั้นปัจจุบัน / ผู้ถือหรือทีม)
--   kind = 'approval' เอกสารที่รออนุมัติ
-- เห็นเฉพาะฟอร์มที่ตัวเองมองเห็นได้ (ผู้จัดการเห็นทั้ง workspace) — ไม่ขยายสิทธิ์จากการเห็นพื้นที่
-- ============================================================
create or replace function public.area_open_items(p_tenant uuid, p_area uuid default null)
returns table (
  kind text, id uuid, form_id uuid, form_title text, form_icon text,
  area_id uuid, area_code text, area_name text,
  step_title text, holder text, started_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare mgr boolean;
begin
  if auth.uid() is null or p_tenant is null or p_tenant not in (select public.my_tenant_ids()) then
    raise exception 'not a member';
  end if;
  if not public.mfa_ok() then raise exception 'mfa required'; end if;
  mgr := p_tenant in (select public.my_managed_tenant_ids());

  return query
  with vis as (select public.my_visible_form_ids() as fid)
  select * from (
    select 'case'::text, c.id, c.form_id, c.form_title, c.form_icon,
           a.id, a.code, a.name,
           coalesce(c.schema->'steps'->c.step_idx->>'title', ''),
           coalesce(c.claimed_name, t.name, ''),
           c.created_at
      from public.form_cases c
      join public.workspace_areas a on a.id = c.area_id
      left join public.teams t on t.id = c.assignee_team
     where c.tenant_id = p_tenant and c.status = 'open'
       and (p_area is null or c.area_id = p_area)
       and (mgr or c.form_id in (select fid from vis))
    union all
    select 'approval'::text, s.id, s.form_id, s.form_title, s.form_icon,
           a.id, a.code, a.name,
           '', coalesce(s.user_name, ''),
           s.submitted_at
      from public.submissions s
      join public.workspace_areas a on a.id = s.area_id
     where s.tenant_id = p_tenant and s.approval_status = 'pending'
       and (p_area is null or s.area_id = p_area)
       and (mgr or s.form_id in (select fid from vis))
  ) x
  order by 11 asc
  limit 500;
end $$;
revoke all on function public.area_open_items(uuid, uuid) from public, anon;
grant execute on function public.area_open_items(uuid, uuid) to authenticated;

-- 2FA: ตารางใหม่ต้องมี policy krok_mfa_required เหมือนตารางอื่น (0055 / 0071)
drop policy if exists krok_mfa_required on public.workspace_areas;
create policy krok_mfa_required on public.workspace_areas as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
