-- ============================================================
-- KROK · 0078_form_defect_hint
-- forms.summary.defect_hint = ฟอร์มนี้มีตัวเลือกที่ดูเหมือนข้อบกพร่อง (ชำรุด, ไม่ผ่าน, NG …)
--   แต่ยังไม่ได้ตั้ง fail_options และเจ้าของยังไม่ได้ตอบแถบเสนอ (schema.defect_ack)
-- ใช้ติดป้ายในรายการฟอร์มของหน้าสร้างฟอร์ม — ไม่เปลี่ยนผลของฟอร์มเอง (เจ้าของต้องกดยืนยัน)
-- คำต้องตรงกับ DEFECT_CONTAINS / DEFECT_EXACT ใน src/lib/defect-words.ts (มีเทสต์ตรวจ)
-- รันซ้ำได้ · ต้องรันหลัง 0077
-- ============================================================

create or replace function public.form_option_is_defect(o text)
returns boolean
language sql immutable as $$
  select lower(btrim(coalesce(o, ''))) in ('เสีย', 'ng', 'n/g', 'fail', 'failed')
      or lower(coalesce(o, '')) ~ '(ชำรุด|เสียหาย|ไม่ผ่าน|ผิดปกติ|ไม่ปกติ|แตก|รั่ว|บุบ|ฉีกขาด|ไม่สมบูรณ์|ใช้งานไม่ได้|damage|broken|defect|faulty|leak)'
$$;

-- ตัวเลือกพิมพ์เอง (ไม่ใช่จากชุดข้อมูล/พื้นที่) ที่ยังไม่ได้ตั้ง fail_options และมีคำข้อบกพร่อง
create or replace function public.form_defect_hint(s jsonb)
returns boolean
language sql immutable as $$
  with f as (
    select fld
      from jsonb_array_elements(case when jsonb_typeof(s->'steps') = 'array' then s->'steps' else '[]'::jsonb end) st,
           jsonb_array_elements(case when jsonb_typeof(st->'fields') = 'array' then st->'fields' else '[]'::jsonb end) fld
  ),
  holders as (
    -- ช่องเลือก/ติ๊ก
    select fld as h from f
     where fld->>'type' in ('select', 'checkbox') and fld->'options_source' is null and coalesce(fld->>'area', '') <> 'true'
    union all
    -- คอลัมน์ตัวเลือกในตาราง
    select c from f, jsonb_array_elements(case when jsonb_typeof(fld->'columns') = 'array' then fld->'columns' else '[]'::jsonb end) c
     where fld->>'type' = 'table' and c->>'type' = 'select' and c->'options_source' is null
  )
  select coalesce((s->>'defect_ack')::boolean, false) = false and exists (
    select 1 from holders
     where coalesce(jsonb_array_length(case when jsonb_typeof(h->'fail_options') = 'array' then h->'fail_options' else '[]'::jsonb end), 0) = 0
       and exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(h->'options') = 'array' then h->'options' else '[]'::jsonb end) o
                    where public.form_option_is_defect(o))
  );
$$;

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
    'workflow', exists (select 1 from st where n > 1 and (coalesce(v->'assignee'->>'team_id', '') <> '' or coalesce(v->'assignee'->>'user_id', '') <> '')),
    -- มี = true เท่านั้น (strip_nulls ตัด null ทิ้ง)
    'defect_hint', case when public.form_defect_hint(s) then true end
  ));
$$;

-- คำนวณใหม่ทุกฟอร์ม (trigger forms_set_summary ใช้ form_summary() ตัวใหม่อยู่แล้ว)
-- อัปเดตเฉพาะ summary — ไม่แตะ schema จึงไม่สร้างเวอร์ชันใหม่ (0065 นับเฉพาะ schema เปลี่ยน)
update public.forms set summary = public.form_summary(schema);
