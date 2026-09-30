-- ============================================================
-- KROK · 0029_doc_extract
-- บันทึกการดึงข้อมูลจากเอกสาร (fill source kind = "doc")
--
-- เก็บทั้ง raw (ทุกค่าที่ AI อ่านได้) และ accepted (ที่คนหน้างานยืนยัน)
-- ส่วนต่างของสองก้อนนี้คือตัวชี้วัดว่า extraction แม่นแค่ไหน ใช้ปรับ prompt ได้
--
-- รูปต้นฉบับเก็บใน bucket 'submissions' เดิม → re-extract ย้อนหลังได้
--
-- หมายเหตุ: การสแกนบาร์โค้ด/QR ไม่ผ่านตารางนี้ — ถอดรหัสบนเครื่องผู้ใช้
--           ค่าที่ได้แม่น 100% จึงถือเป็นการกรอกปกติ ไม่ต้องเก็บหลักฐาน
-- ============================================================

create table if not exists public.submission_doc_extracts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  source_id     text not null,                       -- FillSource.id ใน schema
  storage_path  text,                                -- รูปต้นฉบับ (null = ไม่ได้เก็บรูป)
  model         text not null default '',
  raw           jsonb not null default '[]'::jsonb,  -- [{key,value,confidence}] ทุกค่าที่อ่านได้
  accepted      jsonb not null default '[]'::jsonb,  -- [{key,field_id,value,edited}] ที่คนยืนยัน
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_doc_extract_sub on public.submission_doc_extracts(submission_id);
create index if not exists idx_doc_extract_tenant on public.submission_doc_extracts(tenant_id, created_at desc);

alter table public.submission_doc_extracts enable row level security;

-- อ่าน: สมาชิก tenant
drop policy if exists doc_extract_select on public.submission_doc_extracts;
create policy doc_extract_select on public.submission_doc_extracts
  for select using (tenant_id in (select public.my_tenant_ids()));

-- เขียน: สมาชิก tenant (คนหน้างานที่กำลังกรอกฟอร์ม)
drop policy if exists doc_extract_insert on public.submission_doc_extracts;
create policy doc_extract_insert on public.submission_doc_extracts
  for insert with check (tenant_id in (select public.my_tenant_ids()));
