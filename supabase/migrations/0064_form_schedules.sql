-- ============================================================
-- KROK · 0064_form_schedules
-- รอบตรวจตามตาราง (ต่อฟอร์ม): ความถี่ · เวลาเปิดรอบ · ระยะเวลาให้ทำ · ผู้รับผิดชอบ · โหมด
--   once = คนในทีมคนไหนทำก็ได้ 1 ใบต่อรอบ · each = ทุกคนที่มอบหมายต้องทำคนละใบ
-- เวลาทั้งหมดเป็นเวลาไทย (Asia/Bangkok) · รอบไม่ถูกสร้างเป็นแถว — คำนวณจากตาราง + ใบที่ส่ง (เวลากรอกจริง)
-- แจ้งเตือน (เริ่มรอบ / เลยกำหนด) โดย schedule_tick() ทุก 5 นาทีผ่าน pg_cron
--   → ลงตาราง notifications เดิม (กระดิ่งในแอป) · schedule_notices กันแจ้งซ้ำ
-- รันซ้ำได้ · ต้องรันหลัง 0063 · ถ้า pg_cron ยังไม่เปิด ตารางใช้งานได้ แต่ยังไม่มีแจ้งเตือนตามเวลา
-- ============================================================

create table if not exists public.form_schedules (
  form_id        uuid primary key references public.forms(id) on delete cascade,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  enabled        boolean not null default true,
  freq           text not null default 'daily' check (freq in ('daily', 'weekdays', 'weekly', 'monthly')),
  days           int[] not null default '{}',          -- weekly: 0-6 (อา.=0) · monthly: 1-31 (เกินวันสุดท้ายของเดือน = วันสุดท้าย)
  times          text[] not null default '{08:00}',     -- เวลาเปิดรอบ 'HH:MM' (หลายกะได้)
  window_min     int not null default 120 check (window_min between 15 and 1440),
  assign_teams   uuid[] not null default '{}',
  assign_users   uuid[] not null default '{}',
  mode           text not null default 'once' check (mode in ('once', 'each')),
  notify_start   boolean not null default true,
  notify_overdue boolean not null default true,
  escalate_users uuid[] not null default '{}',          -- ว่าง = owner/admin ของ workspace
  updated_by     uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint form_schedules_times_ok check (
    cardinality(times) between 1 and 12
    and array_to_string(times, ',') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9])*$'
  ),
  constraint form_schedules_days_ok check (cardinality(days) <= 31)
);
create index if not exists idx_form_schedules_tenant on public.form_schedules(tenant_id);

-- tenant ของตารางต้องตรงกับของฟอร์ม (กันผูกฟอร์มข้าม workspace)
create or replace function public.form_schedules_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select f.tenant_id into new.tenant_id from public.forms f where f.id = new.form_id;
  if new.tenant_id is null then raise exception 'form not found'; end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  select coalesce(array_agg(distinct x order by x), '{}') into new.times from unnest(new.times) x;
  return new;
end $$;
drop trigger if exists form_schedules_guard on public.form_schedules;
create trigger form_schedules_guard before insert or update on public.form_schedules
  for each row execute function public.form_schedules_guard();

alter table public.form_schedules enable row level security;
grant select, insert, update, delete on public.form_schedules to authenticated;

drop policy if exists fsch_select on public.form_schedules;
create policy fsch_select on public.form_schedules
  for select using (tenant_id in (select public.my_tenant_ids()));

drop policy if exists fsch_manage on public.form_schedules;
create policy fsch_manage on public.form_schedules
  for all using (public.can_manage(tenant_id)) with check (public.can_manage(tenant_id));

-- กันแจ้งซ้ำ (ใช้ภายในเท่านั้น)
create table if not exists public.schedule_notices (
  form_id  uuid not null references public.forms(id) on delete cascade,
  round_at timestamptz not null,
  kind     text not null,
  at       timestamptz not null default now(),
  primary key (form_id, round_at, kind)
);
alter table public.schedule_notices enable row level security;
revoke all on public.schedule_notices from anon, authenticated;

-- ============================================================
-- helpers
-- ============================================================

-- วันนี้ (เวลาไทย) อยู่ในตารางไหม
create or replace function public.schedule_day_match(p_freq text, p_days int[], d date)
returns boolean
language sql immutable as $$
  select case p_freq
    when 'daily' then true
    when 'weekdays' then extract(isodow from d) between 1 and 5
    when 'weekly' then extract(dow from d)::int = any(p_days)
    when 'monthly' then extract(day from d)::int = any(p_days)
      or (d = (date_trunc('month', d) + interval '1 month - 1 day')::date
          and exists (select 1 from unnest(p_days) x where x > extract(day from d)))
    else false
  end
$$;

-- ผู้รับผิดชอบของตาราง (สมาชิกทีมที่เลือก ∪ คนที่เลือก) ที่ยังอยู่ใน workspace
create or replace function public.schedule_assignees(p_form uuid)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct m.user_id
    from public.form_schedules s
    join public.memberships m on m.tenant_id = s.tenant_id
   where s.form_id = p_form
     and (m.user_id = any(s.assign_users)
          or exists (select 1 from public.team_members tm where tm.user_id = m.user_id and tm.team_id = any(s.assign_teams)))
$$;
revoke all on function public.schedule_assignees(uuid) from public, anon, authenticated;

-- ============================================================
-- schedule_tick(): เรียกทุก 5 นาที
--  - รอบที่เพิ่งเปิด (ภายใน 30 นาที) → แจ้งผู้รับผิดชอบ
--  - รอบที่เพิ่งเลยกำหนด (ภายใน 2 ชม.) และยังไม่ครบ → แจ้งคนที่ยังไม่ทำ + หัวหน้า
--  ใบที่นับ = เวลากรอกจริง (filled_at ถ้ามี) ตั้งแต่ 15 นาทีก่อนเปิดรอบ ถึงเวลากำหนด
-- ============================================================
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
begin
  for s in
    select fs.*, f.title as form_title
      from public.form_schedules fs
      join public.forms f on f.id = fs.form_id
     where fs.enabled and f.status = 'published' and f.deleted_at is null
       and (fs.notify_start or fs.notify_overdue)
  loop
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
                where x.form_id = s.form_id
                  and coalesce(x.filled_at, x.submitted_at) >= v_open - interval '15 minutes');
            get diagnostics v_rows = row_count;
            v_sent := v_sent + v_rows;
          end if;
        end if;

        -- ② เลยกำหนด
        if s.notify_overdue and v_due <= v_now and v_due > v_now - interval '2 hours' then
          if s.mode = 'each' and cardinality(v_assignees) > 0 then
            select coalesce(array_agg(u), '{}') into v_missing
              from unnest(v_assignees) u
             where not exists (
               select 1 from public.submissions x
                where x.form_id = s.form_id and x.submitted_by = u
                  and coalesce(x.filled_at, x.submitted_at) >= v_open - interval '15 minutes'
                  and coalesce(x.filled_at, x.submitted_at) < v_due);
            v_done := cardinality(v_missing) = 0;
          else
            v_done := exists (
              select 1 from public.submissions x
               where x.form_id = s.form_id
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
  end loop;

  -- เก็บกวาดบันทึกกันซ้ำที่เก่ากว่า 3 วัน
  delete from public.schedule_notices where round_at < v_now - interval '3 days';

  begin
    insert into public.cron_runs(job, last_at, ok, note) values ('schedule', v_now, true, json_build_object('sent', v_sent)::text)
      on conflict (job) do update set last_at = excluded.last_at, ok = true, note = excluded.note;
  exception when undefined_table then null;
  end;
  return v_sent;
end $$;
revoke all on function public.schedule_tick() from public, anon, authenticated;

-- ============================================================
-- pg_cron: ทุก 5 นาที (ไม่มี pg_cron = ข้าม · เปิด extension แล้วรันไฟล์นี้ซ้ำได้)
-- ============================================================
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron ไม่พร้อมใช้ (%): เปิดที่ Database › Extensions แล้วรันไฟล์นี้ซ้ำ', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('krok_schedule_tick', '*/5 * * * *', 'select public.schedule_tick()');
  end if;
end $$;
