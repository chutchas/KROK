-- ============================================================
-- KROK · 0076_security_fixes
-- ผลตรวจความปลอดภัยรอบ 0072–0074
--   1) child_form_open: คนกดต้องมองเห็นใบหลัก (กติกาเดียวกับ RLS ของ form_cases) · ตรวจก่อนล็อกแถว
--      · ฟอร์มลูกค้างได้ไม่เกิน 20 ใบต่อใบหลัก · ค่าที่ส่งไปต้องมาจากช่องชนิดที่รองรับ ตัดที่ 1000 ตัว
--   2) area_open_items: คนที่ไม่ใช่ผู้ดูแลและไม่เกี่ยวกับงานนั้น เห็นแค่ฟอร์ม / ขั้น / เวลา
--      (ไม่เห็นเลขงาน เลขเอกสาร ชื่อผู้ถือ) — ยังรู้ว่ามีงานซ้อนในพื้นที่เดียวกัน
--   3) พื้นที่ของเอกสาร: ใช้ได้เฉพาะงานใน workspace เดียวกัน · คำนวณใหม่เมื่อแก้ area_id / answers
--   4) workspace_areas: เพิ่ม/แก้ได้เฉพาะ owner/admin (ตรงกับหน้าแอป)
-- รันซ้ำได้ · ต้องรันหลัง 0075 (ใช้ case_owner_user จาก 0075)
-- ============================================================

-- ใบหลักนี้ผู้เรียกมองเห็นไหม (ต้องตรงกับ policy cases_select ใน 0033)
create or replace function public.child_parent_visible(p public.form_cases)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    auth.uid() = any(p.participants)
    or p.claimed_by = auth.uid()
    or p.assignee_team in (select public.my_team_ids())
    or public.case_owner_user(p.schema, p.step_idx) = auth.uid()
    or public.can_manage(p.tenant_id), false)
$$;
revoke all on function public.child_parent_visible(public.form_cases) from public, anon, authenticated;

create or replace function public.child_form_open(p_parent uuid, p_field text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p public.form_cases; b record; f record; seg_end int;
  t0 uuid; u0 uuid; holder uuid; nm text; ans jsonb := '{}'::jsonb; s jsonb; cf jsonb; v jsonb;
  k int; nsteps int; meta jsonb := '{}'::jsonb;
  cid uuid; lid uuid; allowed_types text[] := array['text', 'number', 'datetime', 'select'];
begin
  if uid is null then raise exception 'unauthorized'; end if;
  -- ตรวจสมาชิก + มองเห็นใบหลักก่อนล็อกแถว (คนนอกล็อกงานคนอื่นไม่ได้)
  select * into p from public.form_cases where id = p_parent;
  if not found or not public.case_is_member(p.tenant_id, uid) or not public.child_parent_visible(p) then
    raise exception 'ไม่พบงาน';
  end if;
  select * into p from public.form_cases where id = p_parent for update;
  if p.status <> 'open' then raise exception 'งานนี้ปิดแล้ว'; end if;

  select * into b from public.child_buttons(p.schema) where field_id = p_field limit 1;
  if not found then raise exception 'ไม่พบปุ่มนี้ในใบงาน'; end if;
  seg_end := public.case_segment_end(p.schema, p.step_idx);
  if b.step_idx < p.step_idx or b.step_idx > seg_end then raise exception 'ใบงานยังไม่อยู่ที่ขั้นของปุ่มนี้'; end if;
  if exists (select 1 from public.form_child_links where child_case_id = p.id) then
    raise exception 'ใบนี้เป็นฟอร์มลูกอยู่แล้ว — เปิดฟอร์มลูกซ้อนไม่ได้';
  end if;
  if not coalesce((b.cfg->>'multiple')::boolean, true)
     and exists (select 1 from public.form_child_links where parent_case_id = p.id and parent_field_id = p_field and status <> 'cancelled') then
    raise exception 'ปุ่มนี้เปิดฟอร์มลูกได้ครั้งเดียว';
  end if;
  -- กันกดรัวจนใบหลักติดประตูไปต่อไม่ได้
  if (select count(*) from public.form_child_links where parent_case_id = p.id and status = 'pending') >= 20 then
    raise exception 'มีฟอร์มลูกที่ยังไม่เสร็จมากเกินไป (20 ใบ) — ให้ใบเดิมเสร็จก่อน';
  end if;

  select id, tenant_id, title, icon, schema, version, status, deleted_at into f
    from public.forms where id = nullif(b.cfg->>'form_id', '')::uuid;
  if not found or f.tenant_id <> p.tenant_id or f.deleted_at is not null then raise exception 'ไม่พบฟอร์มลูก'; end if;
  if f.status::text <> 'published' then raise exception 'ฟอร์มลูกยังไม่เผยแพร่'; end if;
  if f.id = p.form_id then raise exception 'ฟอร์มลูกต้องไม่ใช่ฟอร์มเดียวกับใบหลัก'; end if;
  if exists (select 1 from public.child_buttons(f.schema)) then raise exception 'ฟอร์มลูกมีปุ่มเปิดฟอร์มลูกซ้อนอยู่ — ไม่รองรับ'; end if;

  -- คนทำฟอร์มลูก = ตามที่ฟอร์มลูกกำหนดเอง (ไม่เกี่ยวกับคนกด)
  -- งานเริ่มที่ขั้นแรกที่ตั้งผู้รับผิดชอบไว้ · ขั้นก่อนหน้านั้น (ไม่มีคนทำ) = ขั้นรับข้อมูล ถือว่าเสร็จตอนกดปุ่ม
  nsteps := coalesce(jsonb_array_length(f.schema->'steps'), 0);
  k := (select min(i) from generate_series(0, nsteps - 1) i where public.case_step_assigned(f.schema, i));
  if k is null then raise exception 'ฟอร์มลูกยังไม่ได้กำหนดผู้รับผิดชอบ — ตั้งผู้รับผิดชอบในฟอร์มลูกก่อน'; end if;
  t0 := public.case_step_team(f.schema, k);
  u0 := public.case_step_user(f.schema, k);
  if t0 is not null and not exists (select 1 from public.teams where id = t0 and tenant_id = p.tenant_id) then t0 := null; end if;
  if u0 is not null and not public.case_is_member(p.tenant_id, u0) then u0 := null; end if;
  if t0 is null and u0 is null then raise exception 'ผู้รับผิดชอบของฟอร์มลูกไม่มีอยู่แล้ว — แก้ผู้รับผิดชอบในฟอร์มลูกก่อน'; end if;

  -- ใครกดได้: ผู้ถือใบหลัก · ผู้ดูแล · ผู้รับผิดชอบฟอร์มลูก (มองเห็นใบหลักอยู่แล้วถึงจะเห็นปุ่ม)
  -- coalesce: ค่า null (ไม่มีผู้ถือ/ไม่ได้ตั้งคน) ต้องนับเป็น "ไม่ใช่" ไม่ใช่ null ที่หลุดผ่าน if
  if not coalesce(p.claimed_by = uid or public.can_manage(p.tenant_id)
          or (t0 is not null and t0 in (select public.my_team_ids())) or u0 = uid, false) then
    raise exception 'คุณไม่มีสิทธิ์เปิดฟอร์มนี้';
  end if;

  -- ค่าที่ส่งไป: เฉพาะช่องในขั้นแรกของฟอร์มลูก ชนิดที่รองรับ · ค่าจากใบหลักอ่านจากฐานข้อมูล (ไม่เชื่อ client)
  for s in select * from jsonb_array_elements(case when jsonb_typeof(b.cfg->'send') = 'array' then b.cfg->'send' else '[]'::jsonb end) loop
    select x into cf from jsonb_array_elements(coalesce(f.schema->'steps'->0->'fields', '[]'::jsonb)) x
     where x->>'id' = s->>'to' and x->>'type' = any(allowed_types) limit 1;
    if cf is null then continue; end if;
    v := null;
    if coalesce(s->>'from', '') <> '' then
      -- ต้นทางต้องเป็นช่องชนิดที่ส่งได้ (ไม่ใช่รูป/ลายเซ็น/ตาราง) · ค่าเป็นข้อความ ≤ 1000 ตัว
      if not exists (select 1
                       from jsonb_array_elements(coalesce(p.schema->'steps', '[]'::jsonb)) st,
                            jsonb_array_elements(coalesce(st->'fields', '[]'::jsonb)) pf
                      where pf->>'id' = s->>'from' and pf->>'type' = any(allowed_types)) then
        cf := null; continue;
      end if;
      v := p.answers->(s->>'from')->'value';
      if v is not null and jsonb_typeof(v) not in ('string', 'number') then v := null; end if;
      if v is not null then v := to_jsonb(left(v #>> '{}', 1000)); end if;
    elsif s ? 'value' then
      v := to_jsonb(left(s->>'value', 500));
    end if;
    if v is not null and v <> 'null'::jsonb and v <> '""'::jsonb then
      ans := ans || jsonb_build_object(s->>'to', jsonb_build_object('value', v));
    end if;
    cf := null;
  end loop;

  nm := public.case_member_name(p.tenant_id, uid);
  holder := u0;  -- ไม่ได้ตั้งเป็นรายคน = เข้ากองงานของทีม
  -- ขั้นรับข้อมูลที่ข้ามไป: บันทึกว่ามาจากการกดปุ่ม (ส่งกลับไปขั้นนั้น = กลับไปหาคนกด ผู้ส่งข้อมูลมา)
  for i in 0 .. k - 1 loop
    meta := meta || jsonb_build_object(i::text, jsonb_build_object('by', uid, 'name', nm, 'at', now()));
  end loop;
  cid := gen_random_uuid();
  insert into public.form_cases (
    id, tenant_id, form_id, form_version, form_title, form_icon, schema, title,
    step_idx, assignee_team, claimed_by, claimed_name, claimed_at,
    answers, participants, created_by, created_name, history, step_meta
  ) values (
    cid, p.tenant_id, f.id, coalesce(f.version, 1), coalesce(f.title, ''), coalesce(f.icon, '📋'), f.schema,
    left(p.form_title || ' #' || upper(left(p.id::text, 8)), 120),
    k, case when holder is null then t0 end, holder,
    case when holder is null then null else public.case_member_name(p.tenant_id, holder) end,
    case when holder is null then null else now() end,
    ans, case when holder is null then '{}'::uuid[] else array[holder] end, uid, nm,
    jsonb_build_array(jsonb_build_object('action', 'start', 'step', k, 'by', uid, 'name', nm, 'at', now(),
      'note', 'เปิดจากใบงาน ' || p.form_title || ' #' || upper(left(p.id::text, 8)))),
    meta
  );

  insert into public.form_child_links (tenant_id, parent_case_id, parent_step_idx, parent_field_id,
    child_form_id, child_form_title, child_case_id, created_by, created_name)
  values (p.tenant_id, p.id, b.step_idx, p_field, f.id, coalesce(f.title, ''), cid, uid, nm)
  returning id into lid;

  if holder is distinct from uid then
    perform public.case_notify_next(cid, 'case_assigned',
      case when holder is null then 'งานรอรับ: ' else 'งานส่งถึงคุณ: ' end || coalesce(f.title, ''),
      nm || ' เปิดจากใบงาน ' || p.form_title || ' #' || upper(left(p.id::text, 8)));
  end if;
  return jsonb_build_object('link_id', lid, 'child_case_id', cid, 'child_form_id', f.id, 'mine', coalesce(holder = uid, false));
end $$;
revoke all on function public.child_form_open(uuid, text) from public, anon;
grant execute on function public.child_form_open(uuid, text) to authenticated;

-- ============================================================
-- 2) ใบที่ยังไม่จบตามพื้นที่
-- ============================================================
create or replace function public.area_open_items(p_tenant uuid, p_area uuid default null)
returns table (
  kind text, id uuid, form_id uuid, form_title text, form_icon text,
  area_id uuid, area_code text, area_name text,
  step_title text, holder text, started_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare mgr boolean; uid uuid := auth.uid();
begin
  if uid is null or p_tenant is null or p_tenant not in (select public.my_tenant_ids()) then
    raise exception 'not a member';
  end if;
  if not public.mfa_ok() then raise exception 'mfa required'; end if;
  mgr := p_tenant in (select public.my_managed_tenant_ids());

  -- mine = ผู้เรียกมองเห็นงาน/เอกสารนั้นอยู่แล้ว → เห็นเลขและผู้ถือได้ · ไม่ใช่ = เห็นแค่ว่ามีงานอยู่
  return query
  with vis as (select public.my_visible_form_ids() as fid)
  select * from (
    select 'case'::text,
           case when mine then c.id end, c.form_id, c.form_title, c.form_icon,
           a.id, a.code, a.name,
           coalesce(c.schema->'steps'->c.step_idx->>'title', ''),
           case when mine then coalesce(c.claimed_name, t.name, '') else '' end,
           c.created_at
      from public.form_cases c
      join public.workspace_areas a on a.id = c.area_id and a.tenant_id = p_tenant
      left join public.teams t on t.id = c.assignee_team
      cross join lateral (select mgr or public.child_parent_visible(c) as mine) m
     where c.tenant_id = p_tenant and c.status = 'open'
       and (p_area is null or c.area_id = p_area)
       and (mgr or c.form_id in (select fid from vis))
    union all
    select 'approval'::text,
           case when mine then s.id end, s.form_id, s.form_title, s.form_icon,
           a.id, a.code, a.name,
           '', case when mine then coalesce(s.user_name, '') else '' end,
           s.submitted_at
      from public.submissions s
      join public.workspace_areas a on a.id = s.area_id and a.tenant_id = p_tenant
      cross join lateral (select mgr or s.submitted_by = uid
                              or coalesce(s.approval_chain, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('user_id', uid::text)) as mine) m
     where s.tenant_id = p_tenant and s.approval_status = 'pending'
       and (p_area is null or s.area_id = p_area)
       and (mgr or s.form_id in (select fid from vis))
  ) x
  order by 11 asc
  limit 500;
end $$;
revoke all on function public.area_open_items(uuid, uuid) from public, anon;
grant execute on function public.area_open_items(uuid, uuid) to authenticated;

-- ============================================================
-- 3) พื้นที่ของเอกสาร: งานต้องอยู่ workspace เดียวกัน · แก้ area_id ตรง ๆ ไม่ได้ (คำนวณใหม่เสมอ)
-- ============================================================
create or replace function public.submissions_area()
returns trigger
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  new.area_id := null;
  if new.case_id is not null then
    select area_id into new.area_id from public.form_cases where id = new.case_id and tenant_id = new.tenant_id;
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
create trigger submissions_area before insert or update of case_id, area_id, answers on public.submissions
  for each row execute function public.submissions_area();

-- ล้างค่าที่อาจถูกตั้งข้าม workspace ไปแล้ว
update public.submissions s set area_id = null
 where s.area_id is not null
   and not exists (select 1 from public.workspace_areas a where a.id = s.area_id and a.tenant_id = s.tenant_id);
update public.form_cases c set area_id = null
 where c.area_id is not null
   and not exists (select 1 from public.workspace_areas a where a.id = c.area_id and a.tenant_id = c.tenant_id);

-- ============================================================
-- 4) รายชื่อพื้นที่: owner/admin เท่านั้น (หน้าแอปจำกัดไว้แบบนี้อยู่แล้ว)
-- ============================================================
drop policy if exists warea_insert on public.workspace_areas;
create policy warea_insert on public.workspace_areas
  for insert with check (public.is_ws_admin(tenant_id));
drop policy if exists warea_update on public.workspace_areas;
create policy warea_update on public.workspace_areas
  for update using (public.is_ws_admin(tenant_id)) with check (public.is_ws_admin(tenant_id));
