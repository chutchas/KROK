-- ============================================================
-- KROK · 0001_init
-- Multi-tenant core: tenants, memberships, forms, submissions,
-- submission photos (metadata), audit log. RLS ทุกตาราง.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- enums ----------
do $$ begin
  create type membership_role as enum ('owner','admin','designer','operator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type form_status as enum ('draft','published','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type submission_result as enum ('pass','fail');
exception when duplicate_object then null; end $$;

-- ============================================================
-- tenants — 1 แถว = 1 บริษัท/องค์กรที่ใช้ KROK
-- ============================================================
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- memberships — ผู้ใช้ ↔ tenant พร้อม role
-- ============================================================
create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        membership_role not null default 'operator',
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index if not exists idx_memberships_user on public.memberships(user_id);
create index if not exists idx_memberships_tenant on public.memberships(tenant_id);

-- ============================================================
-- forms — นิยามฟอร์ม (schema เก็บเป็น jsonb)
-- ============================================================
create table if not exists public.forms (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  title       text not null default 'ฟอร์มใหม่',
  icon        text not null default '📋',
  description text not null default '',
  schema      jsonb not null default '{"steps":[]}'::jsonb,
  status      form_status not null default 'draft',
  version     int not null default 1,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz            -- soft delete
);
create index if not exists idx_forms_tenant on public.forms(tenant_id) where deleted_at is null;

-- ============================================================
-- submissions — ข้อมูลที่คนหน้างานกรอก
-- ============================================================
create table if not exists public.submissions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  form_id       uuid not null references public.forms(id) on delete cascade,
  form_title    text not null,
  form_icon     text not null default '📋',
  form_version  int not null default 1,
  submitted_by  uuid references auth.users(id) on delete set null,
  user_name     text not null default '',
  result        submission_result not null default 'pass',
  fails         jsonb not null default '[]'::jsonb,   -- รายการหัวข้อที่ไม่ผ่าน
  answers       jsonb not null default '[]'::jsonb,   -- คำตอบทั้งหมด (ไม่รวมไบต์รูป)
  duration_s    int,
  submitted_at  timestamptz not null default now()
);
create index if not exists idx_sub_tenant_time on public.submissions(tenant_id, submitted_at desc);
create index if not exists idx_sub_form on public.submissions(form_id);

-- ============================================================
-- submission_photos — metadata ของรูป/ลายเซ็น (ไฟล์จริงอยู่ Storage)
-- ============================================================
create table if not exists public.submission_photos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  field_id      text not null,
  storage_path  text not null,           -- path ใน bucket 'submissions'
  ai_check      text,                    -- ผลตรวจรูปโดย AI (ถ้ามี)
  created_at    timestamptz not null default now()
);
create index if not exists idx_photos_sub on public.submission_photos(submission_id);

-- ============================================================
-- audit_log — บันทึกทุกการกระทำสำคัญ (ISO/ตรวจสอบย้อนหลัง)
-- ============================================================
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  tenant_id   uuid references public.tenants(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null,          -- form.create, form.publish, form.delete, submission.create ...
  target_type text,
  target_id   uuid,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_tenant_time on public.audit_log(tenant_id, created_at desc);

-- updated_at trigger
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_forms_touch on public.forms;
create trigger trg_forms_touch before update on public.forms
for each row execute function public.touch_updated_at();
