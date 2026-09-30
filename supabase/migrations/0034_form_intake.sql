-- ============================================================
-- KROK · 0034_form_intake
-- API รับข้อมูลเข้า: ระบบภายนอกยิงค่ามาเติมฟอร์มแทนการกรอกเอง
--
--   POST /api/v1/forms/{formId}/intake   Authorization: Bearer kfi_…
--   - ส่งค่าครบทุกช่องบังคับ → เกิดเป็นเอกสาร (submission) ทันที
--   - ยังไม่ครบ → เปิดเป็นงาน (form_cases) ให้คนกรอกช่องที่เหลือต่อ
--     ส่งให้ผู้รับผิดชอบที่ตั้งในแท็บ API (ไม่ตั้ง = ตามผู้รับผิดชอบขั้นแรกของฟอร์ม; ไม่มีเลย = ผู้ดูแล)
--   - ref (รหัสอ้างอิงของระบบภายนอก) กันการสร้างซ้ำเมื่อยิงซ้ำ
--
-- API key ต่อฟอร์ม เก็บเฉพาะ hash (sha256) — เห็นคีย์เต็มครั้งเดียวตอนสร้าง
-- ต้องรันหลัง 0033 (ใช้ form_cases)
-- ============================================================

create table if not exists public.form_intake (
  form_id        uuid primary key references public.forms(id) on delete cascade,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  enabled        boolean not null default false,
  field_keys     jsonb not null default '{}'::jsonb,   -- { fieldId: "po_no" } ชื่อที่ระบบภายนอกใช้
  assignee       jsonb,                                -- { team_id } | { user_id } ผู้รับงานที่เปิดจาก API
  key_hash       text,
  key_prefix     text,
  key_created_at timestamptz,
  last_used_at   timestamptz,
  updated_by     uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now()
);
create unique index if not exists idx_form_intake_key on public.form_intake(key_hash) where key_hash is not null;
create index if not exists idx_form_intake_tenant on public.form_intake(tenant_id);

alter table public.form_intake enable row level security;

drop policy if exists fi_select on public.form_intake;
create policy fi_select on public.form_intake
  for select using (public.can_manage(tenant_id));

drop policy if exists fi_manage on public.form_intake;
create policy fi_manage on public.form_intake
  for all using (public.can_manage(tenant_id))
  with check (
    public.can_manage(tenant_id)
    and exists (select 1 from public.forms f where f.id = form_id and f.tenant_id = form_intake.tenant_id)
  );

-- รหัสอ้างอิงจากระบบภายนอก (กันยิงซ้ำ) + ที่มาของเอกสาร
alter table public.submissions add column if not exists ext_ref text;
alter table public.submissions add column if not exists source text;
create unique index if not exists idx_submissions_ext_ref on public.submissions(form_id, ext_ref) where ext_ref is not null;

alter table public.form_cases add column if not exists ext_ref text;
create unique index if not exists idx_cases_ext_ref on public.form_cases(form_id, ext_ref) where ext_ref is not null;
