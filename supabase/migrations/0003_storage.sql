-- ============================================================
-- KROK · 0003_storage
-- Private bucket 'submissions' สำหรับรูปถ่าย/ลายเซ็นจากหน้างาน
-- เข้าถึงได้เฉพาะสมาชิก tenant เท่านั้น (ผ่าน signed URL)
-- path convention: <tenant_id>/<submission_id>/<field_id>.jpg
-- ============================================================

insert into storage.buckets (id, name, public)
values ('submissions','submissions', false)
on conflict (id) do nothing;

-- อ่านไฟล์: สมาชิก tenant (folder แรกของ path = tenant_id)
drop policy if exists "krok read own tenant files" on storage.objects;
create policy "krok read own tenant files" on storage.objects
  for select using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1]::uuid in (select public.my_tenant_ids())
  );

-- อัปโหลด: สมาชิก tenant
drop policy if exists "krok upload own tenant files" on storage.objects;
create policy "krok upload own tenant files" on storage.objects
  for insert with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1]::uuid in (select public.my_tenant_ids())
  );
