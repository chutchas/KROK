-- ============================================================
-- KROK · 0074_child_forms
-- ฟอร์มลูก: ปุ่มในใบงานหลัก (ฟิลด์ชนิด child_form) เปิดงานของอีกฟอร์ม แล้วรับผลกลับเป็นแถวใหม่ในตาราง
--   · schema ของปุ่ม: { id, type:'child_form', label, child_form: { form_id, send[], table_id, map[], multiple, gate, source_only } }
--   · ใครกดได้: ผู้ถือใบหลัก / ผู้ดูแล / คนที่ขั้นแรกของฟอร์มลูกกำหนดให้ทำ (ต้องมองเห็นใบหลักอยู่แล้ว — ไม่ขยายสิทธิ์)
--   · คนทำฟอร์มลูก = ผู้รับผิดชอบขั้นแรกของฟอร์มลูก (ไม่ได้ตั้ง = คนที่กด)
--   · ฟอร์มลูกส่งเสร็จ → เขียนแถวกลับเข้าตารางของใบหลัก (สิทธิ์ระบบ) · แถวนั้นแก้/ลบไม่ได้
--   · ออกจากขั้นที่มีปุ่ม: gate = ห้ามถ้ายังมีฟอร์มลูกค้าง · source_only = ต้องมีผลจากฟอร์มลูกอย่างน้อย 1 ใบ
--     (source_only = ตารางรับข้อมูลจากฟอร์มลูกเท่านั้น คนถือขั้นคีย์เองไม่ได้)
--   · ใบหลักถูกส่งกลับไปก่อนขั้นที่มีปุ่ม / ถูกยกเลิก → ฟอร์มลูกที่ค้างถูกปิดทันที (ยกเลิก + เหตุผล)
--   · ฟอร์มลูกถูกยกเลิกเอง → ไม่บล็อกใบหลัก (กดเปิดใบใหม่ได้)
-- รันซ้ำได้ · ต้องรันหลัง 0073
-- ============================================================

create table if not exists public.form_child_links (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  parent_case_id      uuid not null references public.form_cases(id) on delete cascade,
  parent_step_idx     int  not null,
  parent_field_id     text not null,
  child_form_id       uuid references public.forms(id) on delete set null,
  child_form_title    text not null default '',
  child_case_id       uuid references public.form_cases(id) on delete set null,
  child_submission_id uuid references public.submissions(id) on delete set null,
  status              text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  cancel_reason       text,
  writeback_status    text not null default 'pending' check (writeback_status in ('pending', 'ok', 'failed')),
  writeback_error     text,
  created_by          uuid references auth.users(id) on delete set null,
  created_name        text,
  created_at          timestamptz not null default now(),
  done_at             timestamptz
);
create index if not exists idx_child_links_parent on public.form_child_links(parent_case_id, status);
create index if not exists idx_child_links_child_case on public.form_child_links(child_case_id);
create index if not exists idx_child_links_child_sub on public.form_child_links(child_submission_id);

alter table public.form_child_links enable row level security;
revoke all on public.form_child_links from anon, authenticated;
grant select on public.form_child_links to authenticated;  -- เขียนผ่าน RPC / trigger เท่านั้น

-- เห็นลิงก์ได้ถ้าเห็นงานฝั่งใดฝั่งหนึ่ง (RLS ของ form_cases ตัดสิน) — เห็นลิงก์ไม่ได้แปลว่าเปิดอีกฝั่งได้
drop policy if exists child_links_select on public.form_child_links;
create policy child_links_select on public.form_child_links
  for select using (
    tenant_id in (select public.my_tenant_ids())
    and (exists (select 1 from public.form_cases c where c.id = parent_case_id)
         or exists (select 1 from public.form_cases c where c.id = child_case_id))
  );

drop policy if exists krok_mfa_required on public.form_child_links;
create policy krok_mfa_required on public.form_child_links as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- ============================================================
-- helpers
-- ============================================================

-- ปุ่มฟอร์มลูกทั้งหมดใน schema: (field_id, step_idx, config)
create or replace function public.child_buttons(p_schema jsonb)
returns table (field_id text, step_idx int, cfg jsonb)
language sql immutable as $$
  select f->>'id', (s.i - 1)::int, f->'child_form'
    from jsonb_array_elements(case when jsonb_typeof(p_schema->'steps') = 'array' then p_schema->'steps' else '[]'::jsonb end) with ordinality s(st, i),
         jsonb_array_elements(case when jsonb_typeof(st->'fields') = 'array' then st->'fields' else '[]'::jsonb end) f
   where f->>'type' = 'child_form' and jsonb_typeof(f->'child_form') = 'object'
$$;

-- เหตุที่ยังออกจากขั้น p_from..p_to ไม่ได้ (null = ได้)
create or replace function public.child_gate_error(p_case uuid, p_from int, p_to int)
returns text
language plpgsql stable security definer set search_path = public as $$
declare c public.form_cases; b record; t text;
begin
  select * into c from public.form_cases where id = p_case;
  if not found then return null; end if;
  for b in select * from public.child_buttons(c.schema) where step_idx between p_from and p_to loop
    t := coalesce(nullif(b.cfg->>'form_title', ''), 'ฟอร์มลูก');
    if coalesce((b.cfg->>'gate')::boolean, true)
       and exists (select 1 from public.form_child_links l
                    where l.parent_case_id = c.id and l.parent_field_id = b.field_id and l.status = 'pending') then
      return 'ยังมี "' || t || '" ที่ยังไม่เสร็จ — รอให้เสร็จก่อนไปขั้นถัดไป';
    end if;
    if coalesce((b.cfg->>'source_only')::boolean, false)
       and not exists (select 1 from public.form_child_links l
                        where l.parent_case_id = c.id and l.parent_field_id = b.field_id and l.status = 'done') then
      return 'ต้องมีผลจาก "' || t || '" อย่างน้อย 1 ใบก่อนไปขั้นถัดไป';
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.child_gate_error(uuid, int, int) from public, anon, authenticated;
grant execute on function public.child_gate_error(uuid, int, int) to service_role;

-- ยกเลิกฟอร์มลูกที่ค้าง (ลิงก์ + งานของฟอร์มลูก) — เรียกจาก trigger ใน transaction เดียวกับการส่งกลับ/ยกเลิก
create or replace function public.child_cancel_pending(p_parent uuid, p_after_step int, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare l record; cc public.form_cases;
begin
  for l in select * from public.form_child_links
            where parent_case_id = p_parent and status = 'pending' and parent_step_idx > p_after_step
            for update loop
    update public.form_child_links set status = 'cancelled', cancel_reason = left(p_reason, 600), done_at = now() where id = l.id;
    select * into cc from public.form_cases where id = l.child_case_id for update;
    if found and cc.status = 'open' then
      update public.form_cases set
        status = 'cancelled', closed_at = now(),
        history = history || jsonb_build_array(jsonb_build_object(
          'action', 'cancel', 'step', cc.step_idx, 'by', auth.uid(), 'name', 'ระบบ', 'at', now(), 'note', left(p_reason, 500))),
        updated_at = now()
      where id = cc.id;
      perform public.case_notify_next(cc.id, 'case_returned', 'ยกเลิกแล้ว: ' || cc.form_title, left(p_reason, 300));
    end if;
  end loop;
end $$;
revoke all on function public.child_cancel_pending(uuid, int, text) from public, anon, authenticated;

-- ============================================================
-- ใบหลัก: กันแถวจากฟอร์มลูก · ประตูออกจากขั้น · ส่งกลับ/ยกเลิก = ปิดฟอร์มลูกที่ค้าง
-- ============================================================
create or replace function public.form_cases_child_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b record; old_child jsonb; new_rows jsonb; n int; err text; reason text;
begin
  if not exists (select 1 from public.child_buttons(new.schema)) then return new; end if;

  -- 1) แถวจากฟอร์มลูก: ระบบเขียนได้ทางเดียว (writeback) · คนแก้/ลบ/ปลอมไม่ได้ · source_only = คนคีย์เองไม่ได้
  if new.answers is distinct from old.answers and coalesce(current_setting('krok.child_wb', true), '') <> '1' then
    for b in select * from public.child_buttons(new.schema) loop
      continue when coalesce(b.cfg->>'table_id', '') = '';
      old_child := coalesce((select jsonb_agg(r) from jsonb_array_elements(
                     case when jsonb_typeof(old.answers->(b.cfg->>'table_id')->'value') = 'array' then old.answers->(b.cfg->>'table_id')->'value' else '[]'::jsonb end) r
                   where r ? '_child'), '[]'::jsonb);
      new_rows := case when coalesce((b.cfg->>'source_only')::boolean, false) then '[]'::jsonb else
                  coalesce((select jsonb_agg(r) from jsonb_array_elements(
                     case when jsonb_typeof(new.answers->(b.cfg->>'table_id')->'value') = 'array' then new.answers->(b.cfg->>'table_id')->'value' else '[]'::jsonb end) r
                   where jsonb_typeof(r) = 'object' and not (r ? '_child')), '[]'::jsonb) end;
      if old_child <> '[]'::jsonb or new.answers ? (b.cfg->>'table_id') then
        new.answers := jsonb_set(new.answers, array[b.cfg->>'table_id'],
          (case when jsonb_typeof(new.answers->(b.cfg->>'table_id')) = 'object' then new.answers->(b.cfg->>'table_id') else '{}'::jsonb end)
          || jsonb_build_object('value', new_rows || old_child));
      end if;
    end loop;
  end if;

  if old.status <> 'open' then return new; end if;
  n := coalesce(jsonb_array_length(new.schema->'steps'), 0);

  -- 2) ออกจากขั้น (ส่งต่อ / ส่งขั้นสุดท้าย)
  if new.status = 'done' then
    err := public.child_gate_error(new.id, old.step_idx, n - 1);
  elsif new.status = 'open' and new.step_idx > old.step_idx then
    err := public.child_gate_error(new.id, old.step_idx, new.step_idx - 1);
  end if;
  if err is not null then raise exception '%', err; end if;

  -- 3) ส่งกลับ / ยกเลิกใบหลัก
  if new.status = 'cancelled' then
    perform public.child_cancel_pending(new.id, -1,
      'ยกเลิก เนื่องจากใบงานหลักถูกยกเลิก' || coalesce(': ' || nullif(new.history->-1->>'note', ''), ''));
  elsif new.status = 'open' and new.step_idx < old.step_idx then
    reason := 'ยกเลิก เนื่องจากใบงานหลักถูกส่งกลับไป "' || public.case_step_title(new.schema, new.step_idx) || '"'
              || coalesce(': ' || nullif(new.history->-1->>'note', ''), '');
    perform public.child_cancel_pending(new.id, new.step_idx, reason);
  end if;
  return new;
end $$;
drop trigger if exists form_cases_child_guard on public.form_cases;
create trigger form_cases_child_guard before update on public.form_cases
  for each row execute function public.form_cases_child_guard();

-- ============================================================
-- ฟอร์มลูกจบ → เขียนแถวกลับเข้าใบหลัก · ถูกยกเลิกเอง → ลิงก์ยกเลิก (ไม่บล็อกใบหลัก)
-- ============================================================
create or replace function public.form_cases_child_done()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l public.form_child_links; p public.form_cases; b record;
  sub jsonb; row jsonb; m jsonb; it jsonb; tbl text; cur jsonb;
begin
  if old.status <> 'open' or new.status = 'open' then return new; end if;
  select * into l from public.form_child_links where child_case_id = new.id and status = 'pending' for update;
  if not found then return new; end if;

  if new.status = 'cancelled' then
    update public.form_child_links set status = 'cancelled', done_at = now(),
      cancel_reason = 'ฟอร์มลูกถูกยกเลิก' || coalesce(': ' || nullif(new.history->-1->>'note', ''), '')
     where id = l.id;
    return new;
  end if;

  -- done
  update public.form_child_links set status = 'done', done_at = now(), child_submission_id = new.submission_id where id = l.id;
  select * into p from public.form_cases where id = l.parent_case_id for update;
  if not found or p.status <> 'open' then
    update public.form_child_links set writeback_status = 'failed', writeback_error = 'ใบงานหลักปิดหรือยกเลิกไปแล้ว' where id = l.id;
    return new;
  end if;
  select * into b from public.child_buttons(p.schema) where field_id = l.parent_field_id limit 1;
  tbl := b.cfg->>'table_id';
  if tbl is null or tbl = '' then
    update public.form_child_links set writeback_status = 'failed', writeback_error = 'ไม่พบตารางที่รับผล' where id = l.id;
    return new;
  end if;

  select answers into sub from public.submissions where id = new.submission_id;
  row := jsonb_build_object('_child', l.id::text, '_src', coalesce(nullif(l.child_form_title, ''), 'ฟอร์มลูก'),
                            '_sub', coalesce(new.submission_id::text, ''), '_at', to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'));
  for m in select * from jsonb_array_elements(case when jsonb_typeof(b.cfg->'map') = 'array' then b.cfg->'map' else '[]'::jsonb end) loop
    select x into it from jsonb_array_elements(case when jsonb_typeof(sub) = 'array' then sub else '[]'::jsonb end) x
     where x->>'id' = m->>'from' limit 1;
    if it is not null and coalesce(it->>'display', '') not in ('', '—') then
      row := row || jsonb_build_object(m->>'col', left(it->>'display', 1000));
      if coalesce(it->>'code', '') <> '' then row := row || jsonb_build_object((m->>'col') || '#code', left(it->>'code', 1000)); end if;
    end if;
    it := null;
  end loop;

  cur := case when jsonb_typeof(p.answers->tbl) = 'object' then p.answers->tbl else '{}'::jsonb end;
  perform set_config('krok.child_wb', '1', true);
  update public.form_cases set
    answers = jsonb_set(p.answers, array[tbl], cur || jsonb_build_object('value',
      (case when jsonb_typeof(cur->'value') = 'array' then cur->'value' else '[]'::jsonb end) || jsonb_build_array(row))),
    updated_at = now()
   where id = p.id;
  perform set_config('krok.child_wb', '', true);
  update public.form_child_links set writeback_status = 'ok' where id = l.id;

  perform public.case_notify_next(p.id, 'case_assigned', 'ผลกลับมาแล้ว: ' || l.child_form_title,
    '"' || l.child_form_title || '" เสร็จแล้ว — ผลถูกเพิ่มในใบงาน ' || p.form_title);
  return new;
end $$;
drop trigger if exists form_cases_child_done on public.form_cases;
create trigger form_cases_child_done after update of status on public.form_cases
  for each row execute function public.form_cases_child_done();

-- ============================================================
-- RPC: กดปุ่มเปิดฟอร์มลูก
-- ============================================================
create or replace function public.child_form_open(p_parent uuid, p_field text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p public.form_cases; b record; f record; seg_end int;
  t0 uuid; u0 uuid; holder uuid; nm text; ans jsonb := '{}'::jsonb; s jsonb; cf jsonb; v jsonb;
  cid uuid; lid uuid; allowed_types text[] := array['text', 'number', 'datetime', 'select'];
begin
  if uid is null then raise exception 'unauthorized'; end if;
  select * into p from public.form_cases where id = p_parent for update;
  if not found or not public.case_is_member(p.tenant_id, uid) then raise exception 'ไม่พบงาน'; end if;
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

  select id, tenant_id, title, icon, schema, version, status, deleted_at into f
    from public.forms where id = nullif(b.cfg->>'form_id', '')::uuid;
  if not found or f.tenant_id <> p.tenant_id or f.deleted_at is not null then raise exception 'ไม่พบฟอร์มลูก'; end if;
  if f.status::text <> 'published' then raise exception 'ฟอร์มลูกยังไม่เผยแพร่'; end if;
  if f.id = p.form_id then raise exception 'ฟอร์มลูกต้องไม่ใช่ฟอร์มเดียวกับใบหลัก'; end if;
  if exists (select 1 from public.child_buttons(f.schema)) then raise exception 'ฟอร์มลูกมีปุ่มเปิดฟอร์มลูกซ้อนอยู่ — ไม่รองรับ'; end if;

  t0 := public.case_step_team(f.schema, 0);
  u0 := public.case_step_user(f.schema, 0);
  if t0 is not null and not exists (select 1 from public.teams where id = t0 and tenant_id = p.tenant_id) then t0 := null; end if;
  if u0 is not null and not public.case_is_member(p.tenant_id, u0) then u0 := null; end if;

  -- ใครกดได้: ผู้ถือใบหลัก · ผู้ดูแล · คนที่ขั้นแรกของฟอร์มลูกกำหนดให้ทำ (มองเห็นใบหลักอยู่แล้วถึงจะเห็นปุ่ม)
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
      v := p.answers->(s->>'from')->'value';
    elsif s ? 'value' then
      v := to_jsonb(left(s->>'value', 500));
    end if;
    if v is not null and v <> 'null'::jsonb and v <> '""'::jsonb then
      ans := ans || jsonb_build_object(s->>'to', jsonb_build_object('value', v));
    end if;
    cf := null;
  end loop;

  nm := public.case_member_name(p.tenant_id, uid);
  holder := coalesce(u0, case when t0 is null then uid end);
  cid := gen_random_uuid();
  insert into public.form_cases (
    id, tenant_id, form_id, form_version, form_title, form_icon, schema, title,
    step_idx, assignee_team, claimed_by, claimed_name, claimed_at,
    answers, participants, created_by, created_name, history
  ) values (
    cid, p.tenant_id, f.id, coalesce(f.version, 1), coalesce(f.title, ''), coalesce(f.icon, '📋'), f.schema,
    left(p.form_title || ' #' || upper(left(p.id::text, 8)), 120),
    0, case when holder is null then t0 end, holder,
    case when holder is null then null else public.case_member_name(p.tenant_id, holder) end,
    case when holder is null then null else now() end,
    ans, case when holder is null then '{}'::uuid[] else array[holder] end, uid, nm,
    jsonb_build_array(jsonb_build_object('action', 'start', 'step', 0, 'by', uid, 'name', nm, 'at', now(),
      'note', 'เปิดจากใบงาน ' || p.form_title || ' #' || upper(left(p.id::text, 8))))
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
-- เอกสารจากงาน: พื้นที่ (0072) ต้องคำนวณตอนผูก case_id ด้วย (case_complete ผูกหลัง insert)
-- ============================================================
drop trigger if exists submissions_area on public.submissions;
create trigger submissions_area before insert or update of case_id on public.submissions
  for each row execute function public.submissions_area();

-- ============================================================
-- realtime: ใบหลักที่เปิดค้างอยู่รับแถวที่ฟอร์มลูกเขียนกลับทันที (RLS ของ form_cases ยังคุมสิทธิ์)
-- ============================================================
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'form_cases'
     ) then
    alter publication supabase_realtime add table public.form_cases;
  end if;
end $$;
