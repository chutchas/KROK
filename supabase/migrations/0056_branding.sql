-- ============================================================
-- KROK · 0056_branding
-- แบรนด์ของ workspace: โลโก้ + ธีมสี (สีหลัก/ปุ่ม, สีแถบหัว) + ข้อความท้ายเอกสาร
-- ฟอร์มตั้งทับได้ใน schema.theme (ไม่ต้องใช้ตารางนี้)
-- ไฟล์โลโก้/รูปประกอบอยู่ใน bucket "branding" (อ่านสาธารณะ — ฟอร์มสาธารณะและ PDF ต้องเปิดได้)
--   path: <tenant_id>/<ชื่อไฟล์สุ่ม> · รูปเท่านั้น (ไม่รับ SVG) ≤ 2MB · เขียน/ลบได้เฉพาะผู้จัดการ workspace
-- รันซ้ำได้ · ต้องรันหลัง 0055
-- ============================================================

create table if not exists public.tenant_branding (
  tenant_id  uuid primary key references public.tenants(id) on delete cascade,
  logo_url   text,
  theme      jsonb not null default '{}'::jsonb,   -- { primary, header, footer_text }
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.tenant_branding enable row level security;

drop policy if exists branding_select on public.tenant_branding;
create policy branding_select on public.tenant_branding
  for select using (tenant_id in (select public.my_tenant_ids()));
drop policy if exists branding_write on public.tenant_branding;
create policy branding_write on public.tenant_branding
  for all using (tenant_id in (select public.my_managed_tenant_ids()))
  with check (tenant_id in (select public.my_managed_tenant_ids()));

-- 2FA ของ 0055 ครอบตารางใหม่ด้วย
drop policy if exists krok_mfa_required on public.tenant_branding;
create policy krok_mfa_required on public.tenant_branding as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
      on conflict (id) do update set public = true;
    update storage.buckets
       set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'],
           file_size_limit = 2 * 1024 * 1024
     where id = 'branding';
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "krok branding write" on storage.objects';
    execute $p$create policy "krok branding write" on storage.objects for insert to authenticated
      with check (bucket_id = 'branding' and (storage.foldername(name))[1]::uuid in (select public.my_managed_tenant_ids()))$p$;
    execute 'drop policy if exists "krok branding update" on storage.objects';
    execute $p$create policy "krok branding update" on storage.objects for update to authenticated
      using (bucket_id = 'branding' and (storage.foldername(name))[1]::uuid in (select public.my_managed_tenant_ids()))$p$;
    execute 'drop policy if exists "krok branding delete" on storage.objects';
    execute $p$create policy "krok branding delete" on storage.objects for delete to authenticated
      using (bucket_id = 'branding' and (storage.foldername(name))[1]::uuid in (select public.my_managed_tenant_ids()))$p$;
    -- upsert ต้องอ่านได้ — เฉพาะโฟลเดอร์ workspace ตัวเอง (ไฟล์เปิดผ่าน public URL อยู่แล้ว)
    execute 'drop policy if exists "krok branding read own" on storage.objects';
    execute $p$create policy "krok branding read own" on storage.objects for select to authenticated
      using (bucket_id = 'branding' and (storage.foldername(name))[1]::uuid in (select public.my_tenant_ids()))$p$;
  end if;
end $$;
