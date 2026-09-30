-- ============================================================
-- KROK · 0032_submission_drafts
-- แบบร่างของการกรอกฟอร์ม (บันทึกไว้ก่อน ยังไม่ส่ง) — เก็บบน server กรอกต่อข้ามเครื่องได้
--
-- - เป็นของผู้กรอกคนเดียว (RLS: user_id = auth.uid() และต้องเป็นสมาชิก tenant)
-- - ฟอร์มเดียวกันมีได้หลายร่าง (เช่น ตรวจรถหลายคันค้างพร้อมกัน)
-- - หมดอายุ 30 วันหลังแก้ไขล่าสุด (expires_at) — ลบตอนเปิดหน้าแบบร่าง และจาก /api/cron/cleanup
-- - รูปถ่าย/ลายเซ็น/รูปเอกสารของร่างอยู่ใน bucket 'drafts'
--   path: <tenant_id>/<user_id>/<draft_id>/<ชื่อไฟล์>  — เจ้าของเท่านั้นที่อ่าน/เขียน/ลบได้
-- ============================================================

create table if not exists public.submission_drafts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  form_id      uuid not null references public.forms(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  form_version int  not null default 1,
  title        text not null default '',          -- ชื่อร่าง (จากคำตอบช่องแรก ๆ)
  step_idx     int  not null default 0,
  mode         text not null default 'mobile' check (mode in ('mobile','paper')),
  answers      jsonb not null default '{}'::jsonb, -- { fieldId: { value, note, ai, src } }
  media        jsonb not null default '{}'::jsonb, -- { "p:<fieldId>" | "s:<fieldId>" | "d:<n>": storage path }
  doc_extracts jsonb not null default '[]'::jsonb, -- หลักฐาน AI อ่านเอกสาร (รูปอยู่ใน media "d:<n>")
  filled       int  not null default 0,
  total        int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days'
);
create index if not exists idx_drafts_user on public.submission_drafts(user_id, tenant_id, updated_at desc);
create index if not exists idx_drafts_expiry on public.submission_drafts(expires_at);

-- แก้ไขเมื่อไร ต่ออายุอีก 30 วัน
create or replace function public.touch_draft() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.expires_at := now() + interval '30 days';
  return new;
end $$;
drop trigger if exists trg_drafts_touch on public.submission_drafts;
create trigger trg_drafts_touch before update on public.submission_drafts
  for each row execute function public.touch_draft();

alter table public.submission_drafts enable row level security;

drop policy if exists drafts_own on public.submission_drafts;
create policy drafts_own on public.submission_drafts
  for all
  using (user_id = auth.uid() and tenant_id in (select public.my_tenant_ids()))
  with check (user_id = auth.uid() and tenant_id in (select public.my_tenant_ids()));

-- ------------------------------------------------------------
-- bucket ไฟล์ของแบบร่าง (private)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('drafts', 'drafts', false)
on conflict (id) do nothing;

drop policy if exists "krok drafts own select" on storage.objects;
create policy "krok drafts own select" on storage.objects
  for select using (
    bucket_id = 'drafts'
    and (storage.foldername(name))[1]::uuid in (select public.my_tenant_ids())
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "krok drafts own insert" on storage.objects;
create policy "krok drafts own insert" on storage.objects
  for insert with check (
    bucket_id = 'drafts'
    and (storage.foldername(name))[1]::uuid in (select public.my_tenant_ids())
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "krok drafts own update" on storage.objects;
create policy "krok drafts own update" on storage.objects
  for update using (
    bucket_id = 'drafts'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "krok drafts own delete" on storage.objects;
create policy "krok drafts own delete" on storage.objects
  for delete using (
    bucket_id = 'drafts'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
