-- ============================================================
-- KROK · 0040_case_row_photos
-- รูปถ่ายต่อแถวของตาราง (คอลัมน์ "รูปถ่าย") ในงานกรอกหลายคน
-- key ของรูปในตาราง = "p:<fieldId>.<colId>.<สุ่ม>" → นับเป็นของฟิลด์ <fieldId>
-- เดิม case_save รับเฉพาะ key ที่ตรงกับ id ฟิลด์เป๊ะ ๆ รูปในตารางจึงถูกทิ้งตอนบันทึก/ส่งต่องาน
-- เปลี่ยนเฉพาะการเทียบ key (ส่วนก่อนจุดแรก) — ตรรกะอื่นเหมือนเดิมทุกอย่าง
-- ============================================================

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
  -- ต้องยังเป็นสมาชิก workspace (คนที่ถูกเอาออกแล้วแก้งานที่ถือค้างไม่ได้)
  if not found or not public.case_is_member(c.tenant_id, uid) then raise exception 'ไม่พบงาน'; end if;
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
    coalesce((select jsonb_object_agg(k, v) from jsonb_each(c.media) e(k, v) where not (split_part(substr(k, 3), '.', 1) = any(ids))), '{}'::jsonb)
    || coalesce((select jsonb_object_agg(k, v) from jsonb_each(coalesce(p_media, '{}'::jsonb)) e(k, v)
                 where substr(k, 1, 2) in ('p:', 's:') and split_part(substr(k, 3), '.', 1) = any(ids)
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
