-- ============================================================
-- KROK · 0037_dashboard_metrics
-- วิดเจ็ต dashboard นับในฐานข้อมูล แทนการดึงแถวดิบทีละ 1,000 (สูงสุด 50,000) มานับในแอป
--
-- คืนผลรวมพื้นฐานต่อกลุ่ม แล้วแอปคำนวณ metric ด้วยสูตรเดิม (calcMetricAgg ใน dashboard-meta.ts)
--   n = จำนวนครั้ง, pending, pass, fail, dur_sum/dur_n (เวลาเฉลี่ย), submitters (ชื่อผู้กรอกไม่ซ้ำ)
-- p_group: 'none' = ทั้งช่วง | 'form' = รายฟอร์ม (ranking) | 'day' = รายวัน (trend, รวมวันที่เป็น 0)
-- ช่วงเวลา/วันนับตามเขตเวลา p_tz (ค่าเริ่มต้นเวลาไทย) — เดิมนับตามเวลา server (UTC) ทำให้ "วันนี้" เพี้ยน 7 ชม.
-- security invoker: RLS ของ submissions ยังทำงาน + กรอง tenant ที่ส่งมา
-- ============================================================

create or replace function public.dashboard_metrics(
  p_tenant uuid,
  p_form uuid,
  p_range text,
  p_group text,
  p_tz text default 'Asia/Bangkok'
)
returns table (k text, title text, icon text, n bigint, pending bigint, pass bigint, fail bigint, dur_sum numeric, dur_n bigint, submitters bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  tz text := coalesce(nullif(p_tz, ''), 'Asia/Bangkok');
  today date := (now() at time zone tz)::date;
  since date;
  days int;
begin
  if p_tenant is null or p_tenant not in (select public.my_tenant_ids()) then return; end if;

  since := case p_range
    when 'today' then today
    when 'month' then date_trunc('month', today)::date
    when '7d' then today - 6
    when '30d' then today - 29
    else null end;

  if p_group = 'day' then
    -- จำนวนวันของกราฟ: 7d=7, 30d=30, อื่น ๆ = วันที่ของเดือนนี้ (เหมือน trendDays เดิม)
    days := case p_range when '7d' then 7 when '30d' then 30 else extract(day from today)::int end;
    return query
      with d as (select generate_series(today - (days - 1), today, interval '1 day')::date as day),
      b as (
        select s.id, s.result, s.approval_status, s.duration_s, s.user_name, (s.submitted_at at time zone tz)::date as day
        from public.submissions s
        where s.tenant_id = p_tenant
          and (p_form is null or s.form_id = p_form)
          and s.submitted_at >= ((greatest(today - (days - 1), coalesce(since, today - (days - 1))))::timestamp at time zone tz)
      )
      select to_char(d.day, 'YYYY-MM-DD'), null::text, null::text,
             count(b.id), count(b.id) filter (where b.approval_status::text = 'pending'),
             count(b.id) filter (where b.result::text = 'pass'), count(b.id) filter (where b.result::text = 'fail'),
             coalesce(sum(b.duration_s), 0)::numeric, count(b.duration_s),
             count(distinct nullif(btrim(b.user_name), ''))
      from d left join b on b.day = d.day
      group by d.day
      order by d.day;
    return;
  end if;

  return query
    with b as (
      select s.id, s.form_id, s.form_title, s.form_icon, s.result, s.approval_status, s.duration_s, s.user_name, s.submitted_at
      from public.submissions s
      where s.tenant_id = p_tenant
        and (p_form is null or s.form_id = p_form)
        and (since is null or s.submitted_at >= (since::timestamp at time zone tz))
    )
    select case when p_group = 'form' then coalesce(b.form_id::text, b.form_title) end,
           case when p_group = 'form' then (array_agg(b.form_title order by b.submitted_at desc))[1] end,
           case when p_group = 'form' then (array_agg(b.form_icon order by b.submitted_at desc))[1] end,
           count(*), count(*) filter (where b.approval_status::text = 'pending'),
           count(*) filter (where b.result::text = 'pass'), count(*) filter (where b.result::text = 'fail'),
           coalesce(sum(b.duration_s), 0)::numeric, count(b.duration_s),
           count(distinct nullif(btrim(b.user_name), ''))
    from b
    group by case when p_group = 'form' then coalesce(b.form_id::text, b.form_title) end;
end $$;

revoke all on function public.dashboard_metrics(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.dashboard_metrics(uuid, uuid, text, text, text) to authenticated;
