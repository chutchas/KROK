-- ============================================================
-- KROK · 0031_dataset_option_labels
-- dropdown ที่ "แสดงชื่อ แต่เก็บรหัส": ตัวเลือกจาก dataset คืนทั้งค่า (v), ชื่อที่แสดง (l)
-- และค่าคอลัมน์กรองของ cascading (p)
--
-- แยกเป็นฟังก์ชันใหม่ ไม่แก้ dataset_options เดิม — ฟอร์มที่ไม่ได้ตั้งคอลัมน์ที่แสดง
-- ยังเรียกตัวเดิมได้ แม้ยังไม่ได้รัน migration นี้
-- ============================================================

create or replace function public.dataset_option_rows(
  p_dataset uuid,
  p_column text,
  p_label_column text default null,
  p_parent_column text default null,
  p_limit int default 2000
)
returns table(v text, l text, p text)
language sql stable set search_path = public as $$
  select s.v, s.l, s.p
  from (
    -- ค่าเดียวกัน (ภายใต้ค่าแม่เดียวกัน) มีหลายแถว → เอาชื่อจากแถวแรกที่นำเข้า
    select distinct on (r.data->>p_column, case when p_parent_column is null then null else r.data->>p_parent_column end)
           r.data->>p_column as v,
           case when p_label_column is null then null else nullif(r.data->>p_label_column, '') end as l,
           case when p_parent_column is null then null else r.data->>p_parent_column end as p
    from public.dataset_rows r
    join public.datasets d on d.id = r.dataset_id and d.active_batch = r.batch
    where r.dataset_id = p_dataset
      and nullif(r.data->>p_column, '') is not null
    order by r.data->>p_column, case when p_parent_column is null then null else r.data->>p_parent_column end, r.id
  ) s
  order by coalesce(s.l, s.v), s.v, s.p
  limit least(greatest(p_limit, 1), 5000)
$$;

revoke all on function public.dataset_option_rows(uuid, text, text, text, int) from public, anon;
grant execute on function public.dataset_option_rows(uuid, text, text, text, int) to authenticated, service_role;
