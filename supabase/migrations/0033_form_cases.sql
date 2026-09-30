-- ============================================================
-- KROK · 0033_form_cases
-- ฟอร์มที่กรอกหลายคนต่อกันเป็นขั้น ๆ (workflow การกรอก)
--
-- แนวคิด "งาน" (case):
--   - ฟอร์มที่มีขั้นตอนตั้ง "ผู้รับผิดชอบ" เป็นทีมหรือรายบุคคล
--     (schema.steps[i].assignee.team_id | assignee.user_id)
--     = ฟอร์มแบบหลายคน — เริ่มกรอกแล้วกด "ส่งต่อ" จะเกิดงานหนึ่งชิ้น
--   - ช่วงของงาน (segment) = ขั้นตอนต่อเนื่องที่คนเดียวถือ: เริ่มจากขั้นปัจจุบัน
--     ไปจนก่อนถึงขั้นถัดไปที่ตั้งผู้รับผิดชอบไว้ (ขั้นที่ไม่ตั้ง = คนเดิมกรอกต่อ)
--   - จบช่วง → ขั้นถัดไปเป็นทีม: เข้ากองงานของทีม ใครในทีมก็กดรับได้ (รับได้ทีละคน)
--             ขั้นถัดไปเป็นรายบุคคล: ส่งถึงคนนั้นโดยตรง
--   - ขั้นหลังส่งกลับไปขั้นก่อนหน้าได้พร้อมเหตุผล → กลับไปหาคนที่กรอกขั้นนั้น
--   - ขั้นที่เสร็จแล้ว ล็อก: บันทึกได้เฉพาะฟิลด์ในช่วงที่ตัวเองถืออยู่ (ตรวจฝั่ง server)
--   - ขั้นสุดท้ายส่งฟอร์ม → เกิด submission ปกติ 1 รายการ (dashboard/รายงาน/อนุมัติ/webhook เดิมใช้ได้)
--   - งานเก็บ schema ของฟอร์ม ณ ตอนเริ่ม — แก้ฟอร์มกลางทางไม่กระทบงานที่ค้างอยู่
--
-- เขียนผ่าน RPC (security definer) เท่านั้น — ตารางไม่มี policy insert/update/delete
-- ไฟล์ (รูป/ลายเซ็น/รูปเอกสาร) อยู่ bucket 'cases': <tenant>/<case>/<step>/<ชื่อไฟล์>
--   เขียนได้เฉพาะผู้ถืองาน และเฉพาะโฟลเดอร์ของขั้นในช่วงที่ถืออยู่
-- ============================================================

create table if not exists public.form_cases (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  form_id       uuid not null references public.forms(id) on delete cascade,
  form_version  int  not null default 1,
  form_title    text not null default '',
  form_icon     text not null default '📋',
  schema        jsonb not null,                       -- schema ของฟอร์ม ณ ตอนเริ่มงาน
  title         text not null default '',             -- ชื่องาน (จากคำตอบช่องแรก ๆ)
  status        text not null default 'open' check (status in ('open','done','cancelled')),
  step_idx      int  not null default 0,              -- ขั้นที่งานอยู่ตอนนี้ (ต้นช่วง)
  assignee_team uuid references public.teams(id) on delete set null,  -- ทีมที่รับผิดชอบช่วงปัจจุบัน
  claimed_by    uuid references auth.users(id) on delete set null,    -- คนที่ถืองานอยู่ (null = รอคนในทีมกดรับ)
  claimed_name  text,
  claimed_at    timestamptz,
  answers       jsonb not null default '{}'::jsonb,   -- { fieldId: { value, note, ai, src } }
  media         jsonb not null default '{}'::jsonb,   -- { "p:<fieldId>" | "s:<fieldId>": storage path }
  doc_extracts  jsonb not null default '[]'::jsonb,   -- [{ source_id, step, raw, accepted, path }]
  step_meta     jsonb not null default '{}'::jsonb,   -- { "<step>": { by, name, at } } ผู้กรอกล่าสุดของแต่ละขั้น
  history       jsonb not null default '[]'::jsonb,   -- [{ action, step, to, by, name, at, note }]
  participants  uuid[] not null default '{}',         -- ทุกคนที่เคยถืองานนี้ (เห็นงานต่อได้)
  created_by    uuid references auth.users(id) on delete set null,
  created_name  text,
  submission_id uuid references public.submissions(id) on delete set null,
  filled        int  not null default 0,
  total         int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz
);
create index if not exists idx_cases_pool on public.form_cases(tenant_id, assignee_team) where status = 'open' and claimed_by is null;
create index if not exists idx_cases_holder on public.form_cases(claimed_by) where status = 'open';
create index if not exists idx_cases_participants on public.form_cases using gin(participants);
create index if not exists idx_cases_form on public.form_cases(form_id, created_at desc);

-- submission ที่มาจากงาน
alter table public.submissions
  add column if not exists case_id uuid references public.form_cases(id) on delete set null;

-- แจ้งเตือน LINE/Email เมื่อมีงานส่งต่อ/ส่งกลับ
alter table public.tenant_notify
  add column if not exists on_case boolean not null default true;

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

-- บันทึกความคืบหน้า — รับเฉพาะฟิลด์/ไฟล์ของช่วงที่ตัวเองถืออยู่ ส่วนอื่นคงค่าเดิม
create or replace function public.case_save(
  p_case uuid, p_answers jsonb, p_media jsonb, p_doc_extracts jsonb,
  p_title text, p_filled int, p_total int
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c public.form_cases;
  seg_end int;
  ids text[];
  prefix text;
  new_answers jsonb;
  new_media jsonb;
  new_docs jsonb;
begin
  select * into c from public.form_cases where id = p_case for update;
  if not found then raise exception 'ไม่พบงาน'; end if;
  if c.status <> 'open' then raise exception 'งานนี้ปิดแล้ว'; end if;
  if c.claimed_by is distinct from uid then raise exception 'คุณไม่ได้ถืองานนี้อยู่ (อาจถูกส่งต่อหรือคืนงานแล้ว)'; end if;

  seg_end := public.case_segment_end(c.schema, c.step_idx);
  ids := public.case_field_ids(c.schema, c.step_idx, seg_end);
  prefix := c.tenant_id || '/' || c.id || '/';

  new_answers :=
    coalesce((select jsonb_object_agg(k, v) from jsonb_each(c.answers) e(k, v) where not (k = any(ids))), '{}'::jsonb)
    || coalesce((select jsonb_object_agg(k, v) from jsonb_each(coalesce(p_answers, '{}'::jsonb)) e(k, v)
                 where k = any(ids) and jsonb_typeof(v) = 'object'), '{}'::jsonb);

  new_media :=
    coalesce((select jsonb_object_agg(k, v) from jsonb_each(c.media) e(k, v) where not (substr(k, 3) = any(ids))), '{}'::jsonb)
    || coalesce((select jsonb_object_agg(k, v) from jsonb_each(coalesce(p_media, '{}'::jsonb)) e(k, v)
                 where substr(k, 1, 2) in ('p:', 's:') and substr(k, 3) = any(ids)
                   and jsonb_typeof(v) = 'string' and left(v #>> '{}', length(prefix)) = prefix), '{}'::jsonb);

  new_docs :=
    coalesce((select jsonb_agg(e) from jsonb_array_elements(c.doc_extracts) e
              where not (coalesce((e->>'step')::int, -1) between c.step_idx and seg_end)), '[]'::jsonb)
    || coalesce((select jsonb_agg(e) from jsonb_array_elements(
                   case when jsonb_typeof(p_doc_extracts) = 'array' then p_doc_extracts else '[]'::jsonb end) e
                 where jsonb_typeof(e) = 'object'
                   and (e->>'step') ~ '^\d+$' and (e->>'step')::int between c.step_idx and seg_end
                   and (e->>'path' is null or left(e->>'path', length(prefix)) = prefix)), '[]'::jsonb);

  update public.form_cases set
    answers = new_answers,
    media = new_media,
    doc_extracts = new_docs,
    title = case when coalesce(trim(p_title), '') <> '' then left(trim(p_title), 120) else title end,
    filled = greatest(coalesce(p_filled, filled), 0),
    total = greatest(coalesce(p_total, total), 0),
    updated_at = now()
  where id = c.id
  returning updated_at into c.updated_at;
  return c.updated_at;
end $$;

-- ส่งต่อ: จบช่วงของตัวเอง → ไปกองงานของทีมขั้นถัดไป
create or replace function public.case_advance(p_case uuid, p_note text default null)
returns public.form_cases
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c public.form_cases;
  n int; seg_end int; nxt int; t uuid; u uuid; nm text; meta jsonb; i int;
begin
  select * into c from public.form_cases where id = p_case for update;
  if not found then raise exception 'ไม่พบงาน'; end if;
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
  if not found then raise exception 'ไม่พบงาน'; end if;
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
  if not found then raise exception 'ไม่พบงาน'; end if;
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
