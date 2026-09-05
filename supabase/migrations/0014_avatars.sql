-- ============================================================
-- 0014 · รูปโปรไฟล์ (avatar)
-- คอลัมน์ avatar_url + bucket 'avatars' (public read, เขียนเฉพาะของตัวเอง)
-- path convention: <user_id>/avatar.<ext>
-- ============================================================

alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars','avatars', true)
on conflict (id) do nothing;

-- อ่านสาธารณะ (bucket public อยู่แล้ว แต่ประกาศ policy ให้ชัด)
drop policy if exists "krok avatars public read" on storage.objects;
create policy "krok avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

-- อัปโหลด/แก้ไข/ลบเฉพาะโฟลเดอร์ของตัวเอง (folder แรก = user_id)
drop policy if exists "krok avatars write own" on storage.objects;
create policy "krok avatars write own" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "krok avatars update own" on storage.objects;
create policy "krok avatars update own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "krok avatars delete own" on storage.objects;
create policy "krok avatars delete own" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
