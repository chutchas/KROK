-- ============================================================
-- KROK · 0079_submission_soft_delete
-- 1) ลบเอกสารที่ส่งแล้วแบบซ่อน (owner/admin) — กู้คืนได้ 30 วัน แล้วระบบลบจริงพร้อมรูป (cron cleanup)
--    ใบที่ลบ: หายจากทุกหน้า/รายงาน/export/API (RLS) · ยังนับในโควตารายเดือน (กันลบเพื่อได้สิทธิ์ส่งเพิ่ม)
--    ห้ามลบใบที่ผูกฟอร์มหลัก/ฟอร์มลูก (ยกเลิกฟอร์มลูกก่อน) · ลบ/กู้คืนบันทึกใน audit_log
-- 2) สมาชิกทั่วไปเห็นเฉพาะเอกสารที่ตัวเองส่ง + เอกสารของงานหลายขั้นที่ตัวเองมีส่วน + ที่ตัวเองอยู่ในสายอนุมัติ
--    (เดิม 0054: เห็นทุกใบของฟอร์มที่ตัวเองมองเห็น) · owner/admin/designer เห็นทุกใบเหมือนเดิม
-- 3) ฟังก์ชันที่อ่านข้าม RLS ไม่นับใบที่ลบ: schedule_tick, area_open_items, submission_exists, review_submission (ผ่าน RPC กันไว้)
-- รันซ้ำได้ · ต้องรันหลัง 0078
-- ============================================================

alter table public.submissions
  add column if not exists deleted_at      timestamptz,
  add column if not exists deleted_by      uuid references auth.users(id) on delete set null,
  add column if not exists deleted_by_name text,
  add column if not exists delete_reason   text;
create index if not exists idx_submissions_deleted on public.submissions(tenant_id, deleted_at) where deleted_at is not null;
create index if not exists idx_submissions_by_time on public.submissions(submitted_by, submitted_at desc);

-- ---------- งานหลายขั้นที่ฉันมีส่วน (GIN participants) ----------
create or replace function public.my_case_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.id from public.form_cases c
   where c.participants @> array[auth.uid()]
     and c.tenant_id in (select public.my_tenant_ids())
$$;
revoke all on function public.my_case_ids() from public, anon;
grant execute on function public.my_case_ids() to authenticated;

-- ---------- 2) ใครเห็นเอกสาร ----------
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions
  for select using (
    deleted_at is null
    and tenant_id in (select public.my_tenant_ids())
    and (
      tenant_id in (select public.my_managed_tenant_ids())
      or submitted_by = (select auth.uid())
      or case_id in (select public.my_case_ids())
      or coalesce(approval_chain, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('user_id', (select auth.uid())::text))
    )
  );

-- แก้ใบที่ลบแล้วไม่ได้ (อนุมัติ ฯลฯ)
drop policy if exists submissions_review on public.submissions;
create policy submissions_review on public.submissions
  for update using (public.can_manage(tenant_id) and deleted_at is null)
  with check (public.can_manage(tenant_id));

-- คอลัมน์การลบแก้ผ่าน REST ไม่ได้ — ต้องผ่าน RPC (มีเหตุผล + audit)
create or replace function public.zz_guard_submission_update()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.answers          is distinct from old.answers
    or new.fails            is distinct from old.fails
    or new.result           is distinct from old.result
    or new.submitted_by     is distinct from old.submitted_by
    or new.user_name        is distinct from old.user_name
    or new.tenant_id        is distinct from old.tenant_id
    or new.form_id          is distinct from old.form_id
    or new.form_version     is distinct from old.form_version
    or new.submitted_at     is distinct from old.submitted_at
    or new.filled_at        is distinct from old.filled_at
    or new.geo              is distinct from old.geo
    or new.notified_at      is distinct from old.notified_at
    or new.duration_s       is distinct from old.duration_s
    or new.device_id        is distinct from old.device_id
    or new.ext_ref          is distinct from old.ext_ref
    or new.source           is distinct from old.source
    or new.case_id          is distinct from old.case_id
    or new.approval_status  is distinct from old.approval_status
    or new.approval_step    is distinct from old.approval_step
    or new.approval_chain   is distinct from old.approval_chain
    or new.approval_history is distinct from old.approval_history
    or new.reviewed_by      is distinct from old.reviewed_by
    or new.reviewer_name    is distinct from old.reviewer_name
    or new.reviewed_at      is distinct from old.reviewed_at
    or new.review_note      is distinct from old.review_note
    or new.deleted_at       is distinct from old.deleted_at
    or new.deleted_by       is distinct from old.deleted_by
    or new.deleted_by_name  is distinct from old.deleted_by_name
    or new.delete_reason    is distinct from old.delete_reason
  ) then
    raise exception 'แก้ไขข้อมูลของเอกสารที่ส่งแล้วไม่ได้ (การอนุมัติต้องทำผ่านหน้าอนุมัติ)';
  end if;
  return new;
end $$;

-- storage: อัปโหลด/อ่านรูปของใบที่ลบแล้วไม่ได้
create or replace function public.submission_exists(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_id is not null and exists (select 1 from public.submissions where id = p_id and deleted_at is null)
$$;
revoke all on function public.submission_exists(uuid) from public, anon;
grant execute on function public.submission_exists(uuid) to authenticated;

-- ---------- 1) ลบ / กู้คืน / ถังขยะ ----------
create or replace function public.delete_submission(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare s record; uid uuid := auth.uid(); nm text; r text := btrim(coalesce(p_reason, ''));
begin
  if uid is null then raise exception 'unauthorized'; end if;
  if not public.mfa_ok() then raise exception 'mfa required'; end if;
  select * into s from public.submissions where id = p_id for update;
  if not found or s.tenant_id not in (select public.my_tenant_ids()) or s.deleted_at is not null then
    raise exception 'ไม่พบเอกสาร';
  end if;
  if public.my_role(s.tenant_id)::text not in ('owner', 'admin') then
    raise exception 'เฉพาะเจ้าของหรือผู้ดูแล workspace ที่ลบเอกสารได้';
  end if;
  if char_length(r) < 3 then raise exception 'กรุณาระบุเหตุผลที่ลบ'; end if;
  if exists (
    select 1 from public.form_child_links l
     where l.tenant_id = s.tenant_id
       and (l.child_submission_id = s.id
            or (s.case_id is not null and (l.parent_case_id = s.case_id or l.child_case_id = s.case_id)))
       and l.status <> 'cancelled'
  ) then
    raise exception 'เอกสารนี้ผูกกับฟอร์มหลัก/ฟอร์มลูก — ยกเลิกฟอร์มลูกก่อนจึงจะลบได้';
  end if;
  select coalesce(nullif(m.name, ''), nullif(m.email, ''), '') into nm
    from public.memberships m where m.user_id = uid and m.tenant_id = s.tenant_id;
  update public.submissions
     set deleted_at = now(), deleted_by = uid, deleted_by_name = nm, delete_reason = left(r, 500)
   where id = s.id;
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, meta)
  values (s.tenant_id, uid, 'submission.delete', 'submission', s.id,
          jsonb_build_object('doc_no', s.doc_no, 'form_title', s.form_title, 'reason', left(r, 500)));
end $$;
revoke all on function public.delete_submission(uuid, text) from public, anon;
grant execute on function public.delete_submission(uuid, text) to authenticated;

create or replace function public.restore_submission(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare s record; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthorized'; end if;
  if not public.mfa_ok() then raise exception 'mfa required'; end if;
  select * into s from public.submissions where id = p_id for update;
  if not found or s.tenant_id not in (select public.my_tenant_ids()) or s.deleted_at is null then
    raise exception 'ไม่พบเอกสารในถังขยะ';
  end if;
  if public.my_role(s.tenant_id)::text not in ('owner', 'admin') then
    raise exception 'เฉพาะเจ้าของหรือผู้ดูแล workspace ที่กู้คืนได้';
  end if;
  if s.deleted_at < now() - interval '30 days' then raise exception 'เลยกำหนดกู้คืน 30 วันแล้ว'; end if;
  update public.submissions
     set deleted_at = null, deleted_by = null, deleted_by_name = null, delete_reason = null
   where id = s.id;
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, meta)
  values (s.tenant_id, uid, 'submission.restore', 'submission', s.id,
          jsonb_build_object('doc_no', s.doc_no, 'form_title', s.form_title));
end $$;
revoke all on function public.restore_submission(uuid) from public, anon;
grant execute on function public.restore_submission(uuid) to authenticated;

create or replace function public.deleted_submissions(p_tenant uuid)
returns table (
  id uuid, doc_no text, form_title text, form_icon text, user_name text,
  submitted_at timestamptz, deleted_at timestamptz, deleted_by_name text, delete_reason text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or p_tenant not in (select public.my_tenant_ids())
     or public.my_role(p_tenant)::text not in ('owner', 'admin') then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  if not public.mfa_ok() then raise exception 'mfa required'; end if;
  return query
    select s.id, s.doc_no, s.form_title, s.form_icon, s.user_name, s.submitted_at, s.deleted_at, s.deleted_by_name, s.delete_reason
      from public.submissions s
     where s.tenant_id = p_tenant and s.deleted_at is not null and s.deleted_at >= now() - interval '30 days'
     order by s.deleted_at desc
     limit 500;
end $$;
revoke all on function public.deleted_submissions(uuid) from public, anon;
grant execute on function public.deleted_submissions(uuid) to authenticated;

-- ---------- 3) ฟังก์ชันที่อ่านข้าม RLS ----------
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
     where s.tenant_id = p_tenant and s.approval_status = 'pending' and s.deleted_at is null
       and (p_area is null or s.area_id = p_area)
       and (mgr or s.form_id in (select fid from vis))
  ) x
  order by 11 asc
  limit 500;
end $$;
revoke all on function public.area_open_items(uuid, uuid) from public, anon;
grant execute on function public.area_open_items(uuid, uuid) to authenticated;

create or replace function public.schedule_tick()
returns int
language plpgsql security definer set search_path = public as $$
declare
  s record;
  d date;
  t text;
  v_open timestamptz;
  v_due timestamptz;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_rows int;
  v_sent int := 0;
  v_missing uuid[];
  v_assignees uuid[];
  v_done boolean;
  v_hhmm text;
  v_due_txt text;
  v_err int := 0;
begin
  for s in
    select fs.*, f.title as form_title
      from public.form_schedules fs
      join public.forms f on f.id = fs.form_id
     where fs.enabled and f.status = 'published' and f.deleted_at is null
       and (fs.notify_start or fs.notify_overdue)
  loop
   begin
    select coalesce(array_agg(x), '{}') into v_assignees from public.schedule_assignees(s.form_id) x;

    foreach d in array array[v_today - 1, v_today] loop
      continue when not public.schedule_day_match(s.freq, s.days, d);
      foreach t in array s.times loop
        v_open := (d + t::time) at time zone 'Asia/Bangkok';
        v_due := v_open + make_interval(mins => s.window_min);
        v_hhmm := t;
        v_due_txt := to_char(v_due at time zone 'Asia/Bangkok', 'HH24:MI');

        -- ① เริ่มรอบ
        if s.notify_start and cardinality(v_assignees) > 0
           and v_open <= v_now and v_open > v_now - interval '30 minutes' then
          insert into public.schedule_notices(form_id, round_at, kind) values (s.form_id, v_open, 'start')
            on conflict do nothing;
          get diagnostics v_rows = row_count;
          if v_rows > 0 then
            insert into public.notifications (tenant_id, user_id, type, title, body, link)
            select s.tenant_id, u, 'schedule_start',
                   'ถึงรอบตรวจ: ' || s.form_title || ' (' || v_hhmm || ')',
                   'ครบกำหนด ' || v_due_txt || ' น.',
                   '/fill/' || s.form_id
              from unnest(v_assignees) u
             where s.mode = 'each' or not exists (
               select 1 from public.submissions x
                where x.deleted_at is null
                  and x.tenant_id = s.tenant_id and x.form_id = s.form_id
                  and x.submitted_at >= v_open - interval '15 minutes'
                  and coalesce(x.filled_at, x.submitted_at) >= v_open - interval '15 minutes');
            get diagnostics v_rows = row_count;
            v_sent := v_sent + v_rows;
          end if;
        end if;

        -- ② เลยกำหนด
        if s.notify_overdue and v_due <= v_now and v_due > v_now - interval '2 hours'
           and not exists (select 1 from public.schedule_notices n where n.form_id = s.form_id and n.round_at = v_open and n.kind = 'overdue') then
          if s.mode = 'each' and cardinality(v_assignees) > 0 then
            select coalesce(array_agg(u), '{}') into v_missing
              from unnest(v_assignees) u
             where not exists (
               select 1 from public.submissions x
                where x.deleted_at is null
                  and x.tenant_id = s.tenant_id and x.form_id = s.form_id and x.submitted_by = u
                  and x.submitted_at >= v_open - interval '15 minutes'
                  and coalesce(x.filled_at, x.submitted_at) >= v_open - interval '15 minutes'
                  and coalesce(x.filled_at, x.submitted_at) < v_due);
            v_done := cardinality(v_missing) = 0;
          else
            v_done := exists (
              select 1 from public.submissions x
                where x.deleted_at is null
                 and x.tenant_id = s.tenant_id and x.form_id = s.form_id
                 and x.submitted_at >= v_open - interval '15 minutes'
                 and coalesce(x.filled_at, x.submitted_at) >= v_open - interval '15 minutes'
                 and coalesce(x.filled_at, x.submitted_at) < v_due);
            v_missing := v_assignees;
          end if;

          if not v_done then
            insert into public.schedule_notices(form_id, round_at, kind) values (s.form_id, v_open, 'overdue')
              on conflict do nothing;
            get diagnostics v_rows = row_count;
            if v_rows > 0 then
              -- คนที่ยังไม่ทำ
              insert into public.notifications (tenant_id, user_id, type, title, body, link)
              select s.tenant_id, u, 'schedule_overdue',
                     'เลยกำหนดรอบตรวจ: ' || s.form_title || ' (' || v_hhmm || ')',
                     'ครบกำหนดเมื่อ ' || v_due_txt || ' น. — ยังทำได้ (นับว่าสาย)',
                     '/fill/' || s.form_id
                from unnest(v_missing) u;
              get diagnostics v_rows = row_count;
              v_sent := v_sent + v_rows;
              -- หัวหน้า (ที่ตั้งไว้ · ไม่ได้ตั้ง = owner/admin) — ไม่ซ้ำกับคนที่ได้แจ้งไปแล้ว
              insert into public.notifications (tenant_id, user_id, type, title, body, link)
              select s.tenant_id, m.user_id, 'schedule_overdue',
                     'เลยกำหนดรอบตรวจ: ' || s.form_title || ' (' || v_hhmm || ')',
                     case when s.mode = 'each'
                          then 'ยังไม่ทำ ' || cardinality(v_missing) || ' จาก ' || cardinality(v_assignees) || ' คน'
                          else 'ยังไม่มีใครทำรอบนี้' end,
                     '/forms?tab=today'
                from public.memberships m
               where m.tenant_id = s.tenant_id
                 and (case when cardinality(s.escalate_users) > 0 then m.user_id = any(s.escalate_users)
                           else m.role in ('owner', 'admin') end)
                 and not (m.user_id = any(v_missing));
              get diagnostics v_rows = row_count;
              v_sent := v_sent + v_rows;
            end if;
          end if;
        end if;
      end loop;
    end loop;
   exception when others then
    -- ตารางใดตารางหนึ่งพัง (ข้อมูลผิดรูป ฯลฯ) ไม่ให้ทั้งระบบหยุด — ข้ามแล้วทำตารางถัดไป
    v_err := v_err + 1;
    raise warning 'schedule_tick: form % skipped: %', s.form_id, sqlerrm;
   end;
  end loop;

  -- เก็บกวาดบันทึกกันซ้ำที่เก่ากว่า 3 วัน
  delete from public.schedule_notices where round_at < v_now - interval '3 days';

  begin
    insert into public.cron_runs(job, last_at, ok, note) values ('schedule', v_now, true, json_build_object('sent', v_sent, 'skipped', v_err)::text)
      on conflict (job) do update set last_at = excluded.last_at, ok = true, note = excluded.note;
  exception when undefined_table then null;
  end;
  return v_sent;
end $$;
revoke all on function public.schedule_tick() from public, anon, authenticated;

-- อนุมัติใบที่ลบแล้วไม่ได้
create or replace function public.review_submission(p_id uuid, p_decision text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.submissions;
  chain jsonb;
  n int;
  step int;
  cur jsonb;
  assigned boolean;
  nm text;
  note text := left(coalesce(p_note, ''), 500);
  new_status text;
  new_step int;
  advanced boolean := false;
begin
  if uid is null then raise exception 'unauthorized'; end if;
  if not public.mfa_ok() then raise exception 'ต้องยืนยันรหัส 2FA ก่อน' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'การตัดสินไม่ถูกต้อง'; end if;

  select * into s from public.submissions where id = p_id for update;
  if not found or s.tenant_id not in (select public.my_tenant_ids()) or s.deleted_at is not null then raise exception 'ไม่พบรายการ'; end if;
  if not public.can_manage(s.tenant_id) then raise exception 'ไม่มีสิทธิ์อนุมัติ'; end if;
  if s.approval_status::text <> 'pending' then raise exception 'รายการนี้ถูกดำเนินการไปแล้ว'; end if;
  if s.submitted_by = uid and exists (
    select 1 from public.memberships m
     where m.tenant_id = s.tenant_id and m.user_id <> uid and m.role in ('owner', 'admin', 'designer')
  ) then
    raise exception 'อนุมัติเอกสารที่ตัวเองส่งไม่ได้ — ให้ผู้จัดการคนอื่นอนุมัติ';
  end if;

  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into chain
  from (
    select e, ord from jsonb_array_elements(coalesce(s.approval_chain, '[]'::jsonb)) with ordinality as t(e, ord)
    where jsonb_typeof(e) = 'object' and coalesce(e->>'user_id', '') <> ''
    order by ord limit 6
  ) x;
  n := jsonb_array_length(chain);
  step := coalesce(s.approval_step, 0);
  cur := chain->step;

  assigned := case when cur is not null then cur->>'user_id' = uid::text else true end;
  if not assigned and public.my_role(s.tenant_id)::text is distinct from 'owner' then
    raise exception 'ยังไม่ถึงคิวคุณอนุมัติขั้นนี้';
  end if;

  if p_decision = 'rejected' then
    new_status := 'rejected'; new_step := step;
  elsif n > 0 and step < n - 1 then
    new_status := 'pending'; new_step := step + 1; advanced := true;
  else
    new_status := 'approved'; new_step := step;
  end if;

  nm := public.case_member_name(s.tenant_id, uid);
  update public.submissions set
    approval_status = new_status::approval_status,
    approval_step = new_step,
    approval_history = coalesce(approval_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'step', step,
      'label', coalesce(nullif(cur->>'label', ''), 'ขั้น ' || (step + 1)),
      'reviewer_name', nm,
      'decision', p_decision,
      'note', note,
      'at', now())),
    reviewed_by = uid,
    reviewer_name = nm,
    reviewed_at = now(),
    review_note = note
  where id = s.id;

  return jsonb_build_object('status', new_status, 'step', new_step, 'advanced', advanced,
                            'form_id', s.form_id, 'form_title', s.form_title, 'tenant_id', s.tenant_id);
end $$;
revoke all on function public.review_submission(uuid, text, text) from public, anon;
grant execute on function public.review_submission(uuid, text, text) to authenticated;
