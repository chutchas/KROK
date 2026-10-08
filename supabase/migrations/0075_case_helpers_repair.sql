-- ============================================================
-- KROK · 0075_case_helpers_repair
-- ซ่อมฐานข้อมูลที่รัน 0033 ฉบับแรกไปแล้ว: 0033 ถูกแก้ทีหลัง (ผู้รับผิดชอบรายบุคคล + ตรวจสมาชิก)
-- แต่ `supabase db push` ไม่รัน migration ที่รันแล้วซ้ำ → ฟังก์ชันเหล่านี้ไม่มี/เป็นฉบับเก่าบนฐานข้อมูลจริง
--   ไม่มี: case_is_member, case_owner_idx, case_owner_user, case_step_assigned, case_step_user
--   ฉบับเก่า: case_advance/return/claim/release/cancel/complete, case_notify_next, case_member_name,
--            case_segment_end, case_owner_team, case_file_readable, policy cases_select
--   (0040 case_save / 0062 case_start / 0074 child_form_open เรียกฟังก์ชันที่ไม่มี → พังตอนเรียก)
-- เนื้อหา = 0033 ปัจจุบันตั้งแต่ส่วน helper ลงไป ยกเว้น case_start / case_save (ฉบับล่าสุดอยู่ใน 0062 / 0040)
-- ทุกคำสั่งรันซ้ำได้ (create or replace / drop … if exists / on conflict do nothing) — ฐานข้อมูลที่ถูกอยู่แล้วไม่เปลี่ยน
-- ============================================================

-- ============================================================
-- helpers (pure) — ต้องตรงกับ src/lib/cases.ts
-- ============================================================

-- ทีมที่รับผิดชอบขั้น p_idx (null = ไม่ได้ตั้ง)
create or replace function public.case_step_team(p_schema jsonb, p_idx int)
returns uuid language sql immutable as $$
  select case
    when (p_schema->'steps'->p_idx->'assignee'->>'team_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (p_schema->'steps'->p_idx->'assignee'->>'team_id')::uuid
  end
$$;

-- คนที่รับผิดชอบขั้น p_idx (null = ไม่ได้ตั้งเป็นรายบุคคล)
create or replace function public.case_step_user(p_schema jsonb, p_idx int)
returns uuid language sql immutable as $$
  select case
    when (p_schema->'steps'->p_idx->'assignee'->>'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (p_schema->'steps'->p_idx->'assignee'->>'user_id')::uuid
  end
$$;

-- ขั้นนี้ตั้งผู้รับผิดชอบไว้ไหม (ทีมหรือรายบุคคล) = จุดเริ่มช่วงใหม่
create or replace function public.case_step_assigned(p_schema jsonb, p_idx int)
returns boolean language sql immutable as $$
  select public.case_step_team(p_schema, p_idx) is not null or public.case_step_user(p_schema, p_idx) is not null
$$;

-- ขั้นสุดท้ายของช่วงที่เริ่มจาก p_idx: ต่อไปเรื่อย ๆ จนกว่าขั้นถัดไปจะตั้งผู้รับผิดชอบไว้
create or replace function public.case_segment_end(p_schema jsonb, p_idx int)
returns int language plpgsql immutable as $$
declare
  n int := coalesce(jsonb_array_length(p_schema->'steps'), 0);
  i int := p_idx;
begin
  while i + 1 < n and not public.case_step_assigned(p_schema, i + 1) loop
    i := i + 1;
  end loop;
  return i;
end $$;

-- ขั้นต้นช่วงที่มีขั้น p_idx อยู่ (ย้อนหาขั้นที่ตั้งผู้รับผิดชอบไว้ใกล้สุด; -1 = ไม่มี)
create or replace function public.case_owner_idx(p_schema jsonb, p_idx int)
returns int language plpgsql immutable as $$
declare i int := p_idx;
begin
  while i >= 0 loop
    if public.case_step_assigned(p_schema, i) then return i; end if;
    i := i - 1;
  end loop;
  return -1;
end $$;

-- ทีม / คน เจ้าของช่วงที่มีขั้น p_idx อยู่
create or replace function public.case_owner_team(p_schema jsonb, p_idx int)
returns uuid language sql immutable as $$
  select public.case_step_team(p_schema, public.case_owner_idx(p_schema, p_idx))
$$;
create or replace function public.case_owner_user(p_schema jsonb, p_idx int)
returns uuid language sql immutable as $$
  select public.case_step_user(p_schema, public.case_owner_idx(p_schema, p_idx))
$$;

-- เป็นสมาชิก workspace อยู่ไหม
create or replace function public.case_is_member(p_tenant uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (select 1 from public.memberships where tenant_id = p_tenant and user_id = p_user)
$$;

-- field id ทั้งหมดของขั้น p_from..p_to
create or replace function public.case_field_ids(p_schema jsonb, p_from int, p_to int)
returns text[] language sql immutable as $$
  select coalesce(array_agg(f->>'id'), '{}')
  from generate_series(p_from, p_to) g(i)
  cross join lateral jsonb_array_elements(coalesce(p_schema->'steps'->g.i->'fields', '[]'::jsonb)) f
$$;

create or replace function public.case_member_name(p_tenant uuid, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(nullif(name, ''), nullif(email, '')) from public.memberships
      where tenant_id = p_tenant and user_id = p_user limit 1),
    'ผู้ใช้')
$$;

create or replace function public.case_step_title(p_schema jsonb, p_idx int)
returns text language sql immutable as $$
  select coalesce(nullif(p_schema->'steps'->p_idx->>'title', ''), 'ขั้นตอนที่ ' || (p_idx + 1))
$$;

-- แจ้งเตือนในแอปถึงคนที่ต้องทำต่อ: ผู้ถืองาน → ถ้าไม่มี = สมาชิกทีม → ถ้าไม่มีทีม = ผู้ดูแล
create or replace function public.case_notify_next(p_case uuid, p_type text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.form_cases; lnk text;
begin
  select * into c from public.form_cases where id = p_case;
  if not found then return; end if;
  lnk := '/fill/' || c.form_id || '?case=' || c.id;
  if c.claimed_by is not null then
    if c.claimed_by is distinct from auth.uid() then
      insert into public.notifications (tenant_id, user_id, type, title, body, link)
      values (c.tenant_id, c.claimed_by, p_type, p_title, p_body, lnk);
    end if;
  elsif c.assignee_team is not null then
    insert into public.notifications (tenant_id, user_id, type, title, body, link)
    select c.tenant_id, tm.user_id, p_type, p_title, p_body, lnk
    from public.team_members tm
    join public.memberships m on m.user_id = tm.user_id and m.tenant_id = c.tenant_id
    where tm.team_id = c.assignee_team and tm.user_id is distinct from auth.uid();
  else
    insert into public.notifications (tenant_id, user_id, type, title, body, link)
    select c.tenant_id, m.user_id, p_type, p_title, p_body, lnk
    from public.memberships m
    where m.tenant_id = c.tenant_id and m.role in ('owner','admin','designer')
      and m.user_id is distinct from auth.uid();
  end if;
end $$;

-- ============================================================
-- RLS: เห็นงานได้ถ้า เคยถืองาน / ถืออยู่ / อยู่ในทีมของช่วงปัจจุบัน / เป็นผู้ดูแล
-- ============================================================
alter table public.form_cases enable row level security;

drop policy if exists cases_select on public.form_cases;
create policy cases_select on public.form_cases
  for select using (
    tenant_id in (select public.my_tenant_ids())
    and (
      auth.uid() = any(participants)
      or claimed_by = auth.uid()
      or assignee_team in (select public.my_team_ids())
      or public.case_owner_user(schema, step_idx) = auth.uid()
      or public.can_manage(tenant_id)
    )
  );

-- ============================================================
-- RPC
-- ============================================================

-- เริ่มงาน (ตอนกด "ส่งต่อ" ครั้งแรก) — p_id มาจาก client เพื่อให้เรียกซ้ำได้
-- (case_start: ฉบับล่าสุดอยู่ใน migration หลังจากนี้ — ไม่แตะ)

-- (case_save: ฉบับล่าสุดอยู่ใน migration หลังจากนี้ — ไม่แตะ)

create or replace function public.case_advance(p_case uuid, p_note text default null)
returns public.form_cases
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c public.form_cases;
  n int; seg_end int; nxt int; t uuid; u uuid; nm text; meta jsonb; i int;
begin
  select * into c from public.form_cases where id = p_case for update;
  -- ต้องยังเป็นสมาชิก workspace (คนที่ถูกเอาออกแล้วแก้งานที่ถือค้างไม่ได้)
  if not found or not public.case_is_member(c.tenant_id, uid) then raise exception 'ไม่พบงาน'; end if;
  if c.status <> 'open' then raise exception 'งานนี้ปิดแล้ว'; end if;
  if c.claimed_by is distinct from uid then raise exception 'คุณไม่ได้ถืองานนี้อยู่'; end if;

  n := jsonb_array_length(c.schema->'steps');
  seg_end := public.case_segment_end(c.schema, c.step_idx);
  if seg_end >= n - 1 then raise exception 'ถึงขั้นสุดท้ายแล้ว — ใช้ปุ่มส่งฟอร์ม'; end if;

  nm := public.case_member_name(c.tenant_id, uid);
  meta := c.step_meta;
  for i in c.step_idx..seg_end loop
    meta := meta || jsonb_build_object(i::text, jsonb_build_object('by', uid, 'name', nm, 'at', now()));
  end loop;
  nxt := seg_end + 1;
  t := public.case_step_team(c.schema, nxt);
  u := public.case_step_user(c.schema, nxt);
  -- ขั้นรายบุคคล: ส่งถึงคนนั้นโดยตรง (ออกจาก workspace แล้ว = ค้างให้ผู้ดูแลจัดการ)
  if u is not null and not public.case_is_member(c.tenant_id, u) then u := null; end if;

  update public.form_cases set
    step_idx = nxt,
    assignee_team = t,
    claimed_by = u,
    claimed_name = case when u is null then null else public.case_member_name(c.tenant_id, u) end,
    claimed_at = case when u is null then null else now() end,
    step_meta = meta,
    participants = case when uid = any(participants) then participants else participants || uid end,
    history = history || jsonb_build_array(jsonb_build_object(
      'action', 'advance', 'step', c.step_idx, 'to', nxt, 'by', uid, 'name', nm, 'at', now(),
      'note', nullif(left(trim(coalesce(p_note, '')), 500), ''))),
    updated_at = now()
  where id = c.id
  returning * into c;

  perform public.case_notify_next(c.id, 'case_assigned',
    case when u is null then 'งานรอรับ: ' else 'งานส่งถึงคุณ: ' end || c.form_title,
    nm || ' ส่งต่อให้ขั้น "' || public.case_step_title(c.schema, nxt) || '"'
      || case when c.title <> '' then ' · ' || c.title else '' end);
  return c;
end $$;

-- ส่งกลับไปขั้นก่อนหน้า (ต้องมีเหตุผล) → กลับไปหาคนที่กรอกขั้นนั้นล่าสุด
create or replace function public.case_return(p_case uuid, p_to int, p_note text)
returns public.form_cases
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c public.form_cases;
  nm text; prev uuid; holder uuid; t uuid; note text;
begin
  note := left(trim(coalesce(p_note, '')), 500);
  if note = '' then raise exception 'ต้องระบุเหตุผลที่ส่งกลับ'; end if;

  select * into c from public.form_cases where id = p_case for update;
  -- ต้องยังเป็นสมาชิก workspace (คนที่ถูกเอาออกแล้วแก้งานที่ถือค้างไม่ได้)
  if not found or not public.case_is_member(c.tenant_id, uid) then raise exception 'ไม่พบงาน'; end if;
  if c.status <> 'open' then raise exception 'งานนี้ปิดแล้ว'; end if;
  if c.claimed_by is distinct from uid then raise exception 'คุณไม่ได้ถืองานนี้อยู่'; end if;
  if p_to is null or p_to < 0 or p_to >= c.step_idx then raise exception 'ส่งกลับได้เฉพาะขั้นก่อนหน้า'; end if;

  nm := public.case_member_name(c.tenant_id, uid);
  prev := nullif(c.step_meta->(p_to::text)->>'by', '')::uuid;
  -- คนเดิมยังอยู่ในองค์กร → ส่งกลับให้คนนั้นโดยตรง; ไม่อยู่แล้ว → เข้ากองงานของทีม
  if public.case_is_member(c.tenant_id, prev) then
    holder := prev;
  elsif public.case_is_member(c.tenant_id, public.case_owner_user(c.schema, p_to)) then
    holder := public.case_owner_user(c.schema, p_to);
  end if;
  t := public.case_owner_team(c.schema, p_to);

  update public.form_cases set
    step_idx = p_to,
    assignee_team = t,
    claimed_by = holder,
    claimed_name = case when holder is null then null else public.case_member_name(c.tenant_id, holder) end,
    claimed_at = case when holder is null then null else now() end,
    participants = case when uid = any(participants) then participants else participants || uid end,
    history = history || jsonb_build_array(jsonb_build_object(
      'action', 'return', 'step', c.step_idx, 'to', p_to, 'by', uid, 'name', nm, 'at', now(), 'note', note)),
    updated_at = now()
  where id = c.id
  returning * into c;

  perform public.case_notify_next(c.id, 'case_returned',
    'ถูกส่งกลับ: ' || c.form_title,
    nm || ' ส่งกลับมาที่ขั้น "' || public.case_step_title(c.schema, p_to) || '" — ' || note);
  return c;
end $$;

-- กดรับงานจากกองงานของทีม (รับได้ทีละคน)
create or replace function public.case_claim(p_case uuid)
returns public.form_cases
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c public.form_cases; nm text;
begin
  select * into c from public.form_cases where id = p_case for update;
  if not found or c.tenant_id not in (select public.my_tenant_ids()) then raise exception 'ไม่พบงาน'; end if;
  if c.status <> 'open' then raise exception 'งานนี้ปิดแล้ว'; end if;
  if c.claimed_by = uid then return c; end if;
  if c.claimed_by is not null then
    raise exception 'มีคนรับงานนี้ไปแล้ว (%)', coalesce(c.claimed_name, '');
  end if;
  if not ((c.assignee_team is not null and c.assignee_team in (select public.my_team_ids()))
          or public.case_owner_user(c.schema, c.step_idx) is not distinct from uid
          or public.can_manage(c.tenant_id)) then
    raise exception 'งานนี้เป็นของทีมอื่น';
  end if;

  nm := public.case_member_name(c.tenant_id, uid);
  update public.form_cases set
    claimed_by = uid, claimed_name = nm, claimed_at = now(),
    participants = case when uid = any(participants) then participants else participants || uid end,
    history = history || jsonb_build_array(jsonb_build_object('action', 'claim', 'step', c.step_idx, 'by', uid, 'name', nm, 'at', now())),
    updated_at = now()
  where id = c.id
  returning * into c;
  return c;
end $$;

-- คืนงานเข้ากองของทีม (ผู้ถืองาน หรือผู้ดูแล)
create or replace function public.case_release(p_case uuid)
returns public.form_cases
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c public.form_cases; nm text;
begin
  select * into c from public.form_cases where id = p_case for update;
  if not found or c.tenant_id not in (select public.my_tenant_ids()) then raise exception 'ไม่พบงาน'; end if;
  if c.status <> 'open' then raise exception 'งานนี้ปิดแล้ว'; end if;
  if c.claimed_by is null then return c; end if;
  if not (c.claimed_by = uid or public.can_manage(c.tenant_id)) then raise exception 'ไม่มีสิทธิ์คืนงานนี้'; end if;
  if c.assignee_team is null and not public.can_manage(c.tenant_id) then
    raise exception 'ขั้นนี้ไม่ได้ตั้งทีมไว้ — คืนงานไม่ได้ (ให้ผู้ดูแลจัดการ)';
  end if;

  nm := public.case_member_name(c.tenant_id, uid);
  update public.form_cases set
    claimed_by = null, claimed_name = null, claimed_at = null,
    history = history || jsonb_build_array(jsonb_build_object('action', 'release', 'step', c.step_idx, 'by', uid, 'name', nm, 'at', now())),
    updated_at = now()
  where id = c.id
  returning * into c;

  perform public.case_notify_next(c.id, 'case_assigned',
    'งานรอรับ: ' || c.form_title,
    nm || ' คืนงานขั้น "' || public.case_step_title(c.schema, c.step_idx) || '" เข้ากองงาน');
  return c;
end $$;

-- ยกเลิกงาน: ผู้เริ่มงาน (ถ้ายังไม่เคยส่งต่อ และถืออยู่) หรือผู้ดูแล
create or replace function public.case_cancel(p_case uuid, p_note text default null)
returns public.form_cases
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c public.form_cases; nm text;
begin
  select * into c from public.form_cases where id = p_case for update;
  if not found or c.tenant_id not in (select public.my_tenant_ids()) then raise exception 'ไม่พบงาน'; end if;
  if c.status <> 'open' then raise exception 'งานนี้ปิดแล้ว'; end if;
  if not (public.can_manage(c.tenant_id)
          or (c.created_by = uid and c.claimed_by = uid
              and not exists (select 1 from jsonb_array_elements(c.history) h where h->>'action' = 'advance'))) then
    raise exception 'ไม่มีสิทธิ์ยกเลิกงานนี้';
  end if;

  nm := public.case_member_name(c.tenant_id, uid);
  update public.form_cases set
    status = 'cancelled', closed_at = now(),
    history = history || jsonb_build_array(jsonb_build_object('action', 'cancel', 'step', c.step_idx, 'by', uid, 'name', nm, 'at', now(),
      'note', nullif(left(trim(coalesce(p_note, '')), 500), ''))),
    updated_at = now()
  where id = c.id
  returning * into c;
  return c;
end $$;

-- ขั้นสุดท้าย: หลังบันทึก submission สำเร็จ → ปิดงานและผูก submission
create or replace function public.case_complete(p_case uuid, p_submission uuid)
returns public.form_cases
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c public.form_cases;
  n int; nm text; meta jsonb; i int; lnk text;
begin
  select * into c from public.form_cases where id = p_case for update;
  -- ต้องยังเป็นสมาชิก workspace (คนที่ถูกเอาออกแล้วแก้งานที่ถือค้างไม่ได้)
  if not found or not public.case_is_member(c.tenant_id, uid) then raise exception 'ไม่พบงาน'; end if;
  if c.status = 'done' and c.submission_id = p_submission then return c; end if;
  if c.status <> 'open' then raise exception 'งานนี้ปิดแล้ว'; end if;
  if c.claimed_by is distinct from uid then raise exception 'คุณไม่ได้ถืองานนี้อยู่'; end if;

  n := jsonb_array_length(c.schema->'steps');
  if public.case_segment_end(c.schema, c.step_idx) < n - 1 then raise exception 'ยังไม่ถึงขั้นสุดท้าย'; end if;
  if not exists (select 1 from public.submissions
                 where id = p_submission and tenant_id = c.tenant_id and form_id = c.form_id and submitted_by = uid) then
    raise exception 'ไม่พบรายการที่ส่ง';
  end if;

  nm := public.case_member_name(c.tenant_id, uid);
  meta := c.step_meta;
  for i in c.step_idx..(n - 1) loop
    meta := meta || jsonb_build_object(i::text, jsonb_build_object('by', uid, 'name', nm, 'at', now()));
  end loop;

  update public.form_cases set
    status = 'done', closed_at = now(), submission_id = p_submission,
    step_meta = meta,
    participants = case when uid = any(participants) then participants else participants || uid end,
    history = history || jsonb_build_array(jsonb_build_object('action', 'submit', 'step', c.step_idx, 'by', uid, 'name', nm, 'at', now())),
    updated_at = now()
  where id = c.id
  returning * into c;

  update public.submissions set case_id = c.id where id = p_submission;

  -- แจ้งทุกคนที่เคยถืองานว่างานเสร็จแล้ว
  lnk := '/submission/' || p_submission;
  insert into public.notifications (tenant_id, user_id, type, title, body, link, submission_id)
  select c.tenant_id, p, 'case_done', 'งานเสร็จแล้ว: ' || c.form_title,
         nm || ' ส่งฟอร์มขั้นสุดท้าย' || case when c.title <> '' then ' · ' || c.title else '' end, lnk, p_submission
  from unnest(c.participants) p
  where p is distinct from uid;
  return c;
end $$;

revoke all on function public.case_start(uuid, uuid) from public, anon;
revoke all on function public.case_save(uuid, jsonb, jsonb, jsonb, text, int, int) from public, anon;
revoke all on function public.case_advance(uuid, text) from public, anon;
revoke all on function public.case_return(uuid, int, text) from public, anon;
revoke all on function public.case_claim(uuid) from public, anon;
revoke all on function public.case_release(uuid) from public, anon;
revoke all on function public.case_cancel(uuid, text) from public, anon;
revoke all on function public.case_complete(uuid, uuid) from public, anon;
revoke all on function public.case_notify_next(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.case_notify_next(uuid, text, text, text) to service_role;
revoke all on function public.case_is_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.case_member_name(uuid, uuid) from public, anon, authenticated;
grant execute on function public.case_start(uuid, uuid) to authenticated;
grant execute on function public.case_save(uuid, jsonb, jsonb, jsonb, text, int, int) to authenticated;
grant execute on function public.case_advance(uuid, text) to authenticated;
grant execute on function public.case_return(uuid, int, text) to authenticated;
grant execute on function public.case_claim(uuid) to authenticated;
grant execute on function public.case_release(uuid) to authenticated;
grant execute on function public.case_cancel(uuid, text) to authenticated;
grant execute on function public.case_complete(uuid, uuid) to authenticated;

-- ============================================================
-- สิทธิ์ไฟล์ใน bucket 'cases' — path: <tenant>/<case>/<step>/<file>
-- ============================================================
create or replace function public.case_file_readable(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(p_name, '/');
begin
  if array_length(parts, 1) < 4 or parts[2] !~* '^[0-9a-f-]{36}$' then return false; end if;
  return exists (
    select 1 from public.form_cases c
    where c.id = parts[2]::uuid and c.tenant_id::text = parts[1]
      and c.tenant_id in (select public.my_tenant_ids())
      and (auth.uid() = any(c.participants) or c.claimed_by = auth.uid()
           or c.assignee_team in (select public.my_team_ids())
           or public.case_owner_user(c.schema, c.step_idx) = auth.uid()
           or public.can_manage(c.tenant_id))
  );
end $$;

create or replace function public.case_file_writable(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(p_name, '/');
begin
  if array_length(parts, 1) < 4 or parts[2] !~* '^[0-9a-f-]{36}$' or parts[3] !~ '^\d{1,3}$' then return false; end if;
  return exists (
    select 1 from public.form_cases c
    where c.id = parts[2]::uuid and c.tenant_id::text = parts[1]
      and c.status = 'open' and c.claimed_by = auth.uid()
      and parts[3]::int between c.step_idx and public.case_segment_end(c.schema, c.step_idx)
  );
end $$;

grant execute on function public.case_file_readable(text) to authenticated;
grant execute on function public.case_file_writable(text) to authenticated;

insert into storage.buckets (id, name, public)
values ('cases', 'cases', false)
on conflict (id) do nothing;

drop policy if exists "krok cases select" on storage.objects;
create policy "krok cases select" on storage.objects
  for select using (bucket_id = 'cases' and public.case_file_readable(name));

drop policy if exists "krok cases insert" on storage.objects;
create policy "krok cases insert" on storage.objects
  for insert with check (bucket_id = 'cases' and public.case_file_writable(name));

drop policy if exists "krok cases update" on storage.objects;
create policy "krok cases update" on storage.objects
  for update using (bucket_id = 'cases' and public.case_file_writable(name));

drop policy if exists "krok cases delete" on storage.objects;
create policy "krok cases delete" on storage.objects
  for delete using (bucket_id = 'cases' and public.case_file_writable(name));
