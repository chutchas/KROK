-- ============================================================
-- KROK · 0071_audit_fixes (ตรวจความปลอดภัย/ประสิทธิภาพรอบ 2026-10-07)
-- 1) รอบตรวจ: ตรวจเวลา 'HH:MM' ทีละค่า + วัน 0–31 (ค่าผิดรูปเคยทำให้ schedule_tick ทั้งระบบล้ม)
--    schedule_tick: ตารางที่พังข้ามได้ ไม่หยุดทั้งรอบ · จำกัดการสแกน submissions ด้วย tenant + เวลา (ใช้ index)
--    · รอบที่แจ้งเลยกำหนดไปแล้วไม่คำนวณซ้ำ
-- 2) 2FA: ใส่ policy krok_mfa_required ให้ทุกตาราง RLS อีกครั้ง (ตารางที่สร้างหลัง 0055 ยังไม่มี)
-- 3) ลดแพ็กเกจ: ยกเลิกใบตัดเงินต่ออายุที่ค้าง · เปิดต่ออายุอัตโนมัติอีกครั้ง = ยกเลิกการตั้งเวลาลด
--    · แพ็กเกจ "ฟรี" ต้องมีราคาเป็นตัวเลข 0 จริง · ปิด set_plan เดิม (ใช้ request_plan_change แทน)
-- รันซ้ำได้ · ต้องรันหลัง 0070
-- ============================================================

-- ---------- 1) รอบตรวจ ----------
create or replace function public._hhmm_list_ok(p text[])
returns boolean language sql immutable as $$
  select p is not null and cardinality(p) between 1 and 12
     and not exists (select 1 from unnest(p) x where x is null or x !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
$$;
create or replace function public._days_ok(p int[])
returns boolean language sql immutable as $$
  select p is not null and cardinality(p) <= 31 and not exists (select 1 from unnest(p) x where x is null or x < 0 or x > 31)
$$;

-- แก้แถวเดิมที่ผิดรูปก่อนใส่ constraint ใหม่ (ตัดค่าที่ผิดทิ้ง · ไม่เหลือเลย = 08:00)
update public.form_schedules s
   set times = coalesce((select array_agg(distinct x order by x) from unnest(s.times) x
                          where x ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), '{08:00}')
 where not public._hhmm_list_ok(s.times);
update public.form_schedules s
   set days = coalesce((select array_agg(distinct x order by x) from unnest(s.days) x where x between 0 and 31), '{}')
 where not public._days_ok(s.days);

alter table public.form_schedules drop constraint if exists form_schedules_times_ok;
alter table public.form_schedules add constraint form_schedules_times_ok check (public._hhmm_list_ok(times));
alter table public.form_schedules drop constraint if exists form_schedules_days_ok;
alter table public.form_schedules add constraint form_schedules_days_ok check (public._days_ok(days));

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
                where x.tenant_id = s.tenant_id and x.form_id = s.form_id
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
                where x.tenant_id = s.tenant_id and x.form_id = s.form_id and x.submitted_by = u
                  and x.submitted_at >= v_open - interval '15 minutes'
                  and coalesce(x.filled_at, x.submitted_at) >= v_open - interval '15 minutes'
                  and coalesce(x.filled_at, x.submitted_at) < v_due);
            v_done := cardinality(v_missing) = 0;
          else
            v_done := exists (
              select 1 from public.submissions x
               where x.tenant_id = s.tenant_id and x.form_id = s.form_id
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

-- ---------- 2) 2FA ทุกตาราง RLS (รวมตารางใหม่: form_schedules, form_versions, push_subscriptions, push_prefs, …) ----------
do $$
declare r record;
begin
  for r in select schemaname, tablename from pg_tables
            where (schemaname = 'public' and rowsecurity) or (schemaname = 'storage' and tablename = 'objects')
  loop
    execute format('drop policy if exists krok_mfa_required on %I.%I', r.schemaname, r.tablename);
    execute format('create policy krok_mfa_required on %I.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', r.schemaname, r.tablename);
  end loop;
end $$;

-- ---------- 3) ลดแพ็กเกจ ----------
create or replace function public._free_plan_ok(p_plan text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_plan = 'free' or exists (
    select 1 from public.platform_plan_settings s, jsonb_array_elements(coalesce(s.plans->'catalog', '[]'::jsonb)) x
     where s.id and x->>'key' = p_plan and coalesce((x->>'visible')::boolean, true)
       and jsonb_typeof(x->'priceThb') = 'number' and (x->>'priceThb')::numeric <= 0);
$$;
revoke all on function public._free_plan_ok(text) from public, anon, authenticated;

create or replace function public.request_plan_change(p_tenant uuid, p_plan text)
returns text
language plpgsql security definer set search_path = public as $$
declare cur public.account_plans;
begin
  if auth.uid() is null or public.tenant_billing_owner(p_tenant) is distinct from auth.uid() then
    raise exception 'เฉพาะเจ้าของบัญชีที่สร้าง workspace นี้เปลี่ยนแพ็กเกจได้';
  end if;
  if not public._free_plan_ok(p_plan) then raise exception 'แพ็กเกจนี้ต้องชำระเงินก่อน'; end if;

  select * into cur from public.account_plans where user_id = auth.uid() for update;
  if found and cur.plan <> p_plan and cur.expires_at is not null and cur.expires_at > now() then
    update public.account_plans
       set pending_plan = p_plan, pending_at = now(), auto_renew = false, next_attempt_at = null, updated_at = now(), updated_by = auth.uid()
     where user_id = auth.uid();
    -- ใบตัดเงินต่ออายุที่ค้างอยู่ = ยกเลิก (กันตัดผ่านทีหลังแล้วต่ออายุทับการลดแพ็กเกจ)
    update public.invoices set status = 'void'
     where user_id = auth.uid() and kind = 'renewal' and status in ('pending', 'failed');
    return 'scheduled';
  end if;

  insert into public.account_plans (user_id, plan, expires_at, updated_at, updated_by) values (auth.uid(), p_plan, null, now(), auth.uid())
    on conflict (user_id) do update set plan = excluded.plan, expires_at = null, pending_plan = null, pending_at = null, updated_at = now(), updated_by = auth.uid();
  update public.tenants set plan = p_plan where id = any(public.owner_tenant_ids(auth.uid()));
  return 'now';
end $$;
revoke all on function public.request_plan_change(uuid, text) from public, anon;
grant execute on function public.request_plan_change(uuid, text) to authenticated;

-- จ่าย/ต่ออายุ · เปลี่ยนแพ็กเกจ · เปิดต่ออายุอัตโนมัติอีกครั้ง = ล้างการตั้งเวลาลด
create or replace function public.zz_account_plan_clear_pending()
returns trigger language plpgsql as $$
begin
  if new.pending_plan is not null and tg_op = 'UPDATE' and new.pending_plan is not distinct from old.pending_plan
     and (new.plan is distinct from old.plan
          or (new.expires_at is not null and old.expires_at is not null and new.expires_at > old.expires_at)
          or (new.auto_renew and not coalesce(old.auto_renew, false))) then
    new.pending_plan := null;
    new.pending_at := null;
  end if;
  return new;
end $$;

-- set_plan เดิมเปลี่ยนทันที (ข้ามการตั้งเวลา) — แอปใช้ request_plan_change แล้ว
revoke execute on function public.set_plan(uuid, text) from authenticated;
