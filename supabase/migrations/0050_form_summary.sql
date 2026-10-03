-- ============================================================
-- KROK · 0050_form_summary
-- สรุปย่อของฟอร์ม (forms.summary) — หน้า Studio / ฟอร์มทั้งหมด ไม่ต้องดึง schema เต็มทุกฟอร์มมาแค่เพื่อนับขั้น/ฟิลด์
--   { category?, privacy_notice?, steps, fields, workflow }
-- คำนวณอัตโนมัติทุกครั้งที่ schema เปลี่ยน (trigger) + เติมของเดิมให้ครบ
-- ยังไม่รัน = แอปกลับไปดึง schema เต็มแบบเดิม (ใช้งานได้ปกติ แค่ช้ากว่า)
-- รันซ้ำได้ · ต้องรันหลัง 0049
-- ============================================================

alter table public.forms add column if not exists summary jsonb;

create or replace function public.form_summary(s jsonb)
returns jsonb
language sql immutable as $$
  with st as (
    select e.v, e.n
      from jsonb_array_elements(case when jsonb_typeof(s->'steps') = 'array' then s->'steps' else '[]'::jsonb end) with ordinality as e(v, n)
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'category', nullif(s->>'category', ''),
    'privacy_notice', nullif(s->>'privacy_notice', ''),
    'steps', (select count(*) from st),
    'fields', coalesce((select sum(case when jsonb_typeof(v->'fields') = 'array' then jsonb_array_length(v->'fields') else 0 end) from st), 0),
    -- กรอกหลายคน = มีขั้นหลังขั้นแรกที่ตั้งผู้รับผิดชอบ (ตรงกับ isWorkflowSchema ในแอป)
    'workflow', exists (select 1 from st where n > 1 and (coalesce(v->'assignee'->>'team_id', '') <> '' or coalesce(v->'assignee'->>'user_id', '') <> ''))
  ));
$$;

create or replace function public.forms_set_summary()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.schema is distinct from old.schema or new.summary is null then
    new.summary := public.form_summary(new.schema);
  end if;
  return new;
end $$;

drop trigger if exists trg_forms_summary on public.forms;
create trigger trg_forms_summary before insert or update on public.forms
  for each row execute function public.forms_set_summary();

update public.forms set summary = public.form_summary(schema) where summary is null;
