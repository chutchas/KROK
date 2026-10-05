-- ============================================================
-- KROK · 0062_rls_perf
-- 1) my_visible_form_ids(): หา "ฟอร์มที่ฉันมีงานอยู่" จากเส้นทางที่มี index ก่อน
--    เดิม: ทุกฟอร์มใน workspace ไล่ exists(form_cases ...) แล้วกรองทีละแถว (= any(participants) ไม่ใช้ GIN)
--    → ช้าลงตามจำนวนงานสะสม ทุก query ของพนักงานหน้างาน (forms / submissions / เอกสารแนบ / storage)
--    ใหม่: participants @> array[uid] (GIN) ∪ claimed_by = uid ∪ assignee_team ∈ ทีมของฉัน — ผลเหมือนเดิมทุกกรณี
-- 2) index ที่เส้นทางใหม่ใช้ (claimed_by / assignee_team แบบไม่จำกัดสถานะ)
-- 3) case_start: เริ่มงานได้เฉพาะฟอร์มที่มองเห็น (ฟอร์มแชร์เฉพาะทีมอื่น = เริ่มไม่ได้)
-- รันซ้ำได้ · ต้องรันหลัง 0061
-- ============================================================

create index if not exists idx_cases_claimed_any on public.form_cases(claimed_by) where claimed_by is not null;
create index if not exists idx_cases_team_any on public.form_cases(assignee_team) where assignee_team is not null;

create or replace function public.my_visible_form_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  with mt as (select public.my_managed_tenant_ids() as id),
       tm as (select public.my_team_ids() as id),
       my_case_forms as (
         select c.form_id from public.form_cases c where c.participants @> array[auth.uid()]
         union
         select c.form_id from public.form_cases c where c.claimed_by = auth.uid()
         union
         select c.form_id from public.form_cases c where c.assignee_team in (select id from tm)
       )
  select f.id
    from public.forms f
   where f.tenant_id in (select public.my_tenant_ids())
     and (
       f.tenant_id in (select id from mt)
       or coalesce(f.visibility, 'all') in ('all', 'public')
       or (f.visibility = 'teams' and exists (
             select 1 from jsonb_array_elements_text(case when jsonb_typeof(f.visible_teams) = 'array' then f.visible_teams else '[]'::jsonb end) t(v)
              where t.v in (select id::text from tm)))
       or (f.visibility = 'users' and jsonb_typeof(f.visible_users) = 'array' and f.visible_users ? auth.uid()::text)
       or f.id in (select form_id from my_case_forms)
     )
$$;
revoke all on function public.my_visible_form_ids() from public, anon;
grant execute on function public.my_visible_form_ids() to authenticated, service_role;

-- 3) case_start
create or replace function public.case_start(p_id uuid, p_form uuid)
returns public.form_cases
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  f record;
  c public.form_cases;
  t0 uuid;
  u0 uuid;
  nm text;
begin
  if uid is null then raise exception 'unauthorized'; end if;

  select * into c from public.form_cases where id = p_id;
  if found then
    if c.created_by = uid then return c; end if;
    raise exception 'รหัสงานซ้ำ';
  end if;

  select id, tenant_id, title, icon, schema, version, status into f
    from public.forms where id = p_form and deleted_at is null;
  if not found or f.tenant_id not in (select public.my_tenant_ids()) then
    raise exception 'ไม่พบฟอร์ม';
  end if;
  if f.status::text <> 'published' then raise exception 'ฟอร์มนี้ยังไม่เปิดให้กรอก'; end if;
  -- ฟอร์มที่แชร์เฉพาะทีม/เฉพาะคน: ต้องมองเห็นฟอร์มนั้น (0054) ถึงเริ่มงานได้
  if not (f.id in (select public.my_visible_form_ids())) then raise exception 'ไม่มีสิทธิ์กรอกฟอร์มนี้'; end if;

  t0 := public.case_step_team(f.schema, 0);
  u0 := public.case_step_user(f.schema, 0);
  if t0 is not null and not (t0 in (select public.my_team_ids()) or public.can_manage(f.tenant_id)) then
    raise exception 'ขั้นแรกของฟอร์มนี้กรอกได้เฉพาะทีมที่กำหนด';
  end if;
  if u0 is not null and u0 <> uid and not public.can_manage(f.tenant_id) then
    raise exception 'ขั้นแรกของฟอร์มนี้กรอกได้เฉพาะผู้รับผิดชอบที่กำหนด';
  end if;

  nm := public.case_member_name(f.tenant_id, uid);
  insert into public.form_cases (
    id, tenant_id, form_id, form_version, form_title, form_icon, schema,
    step_idx, assignee_team, claimed_by, claimed_name, claimed_at,
    participants, created_by, created_name, history
  ) values (
    p_id, f.tenant_id, f.id, coalesce(f.version, 1), coalesce(f.title, ''), coalesce(f.icon, '📋'), f.schema,
    0, t0, uid, nm, now(),
    array[uid], uid, nm,
    jsonb_build_array(jsonb_build_object('action', 'start', 'step', 0, 'by', uid, 'name', nm, 'at', now()))
  ) returning * into c;
  return c;
end $$;
revoke all on function public.case_start(uuid, uuid) from public, anon;
grant execute on function public.case_start(uuid, uuid) to authenticated;
