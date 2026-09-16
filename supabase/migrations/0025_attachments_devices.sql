-- ============================================================
-- KROK · 0025_attachments_devices
-- (1) form_attachments — เอกสารที่เกี่ยวข้อง (คู่มือ/SOP/drawing) แนบได้ทั้งระดับฟอร์มและระดับฟิลด์
-- (2) devices        — ทะเบียนอุปกรณ์ + อนุมัติรายเครื่อง, ล็อคการกรอกเป็นรายฟอร์ม
-- ============================================================

-- ------------------------------------------------------------
-- 1) เอกสารแนบ
--    field_id = null  → เอกสารระดับฟอร์ม (เห็นได้ทุกขั้นตอน)
--    field_id = f.id  → เอกสารของฟิลด์นั้น (เช่น รูปตัวอย่างจุดที่ต้องถ่าย)
--    kind = 'file'    → ไฟล์ใน bucket 'attachments'  (storage_path)
--    kind = 'link'    → ลิงก์ภายนอก เช่น SharePoint/Drive (url)
-- ------------------------------------------------------------
create table if not exists public.form_attachments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  form_id      uuid not null references public.forms(id) on delete cascade,
  field_id     text,
  kind         text not null default 'file' check (kind in ('file','link')),
  name         text not null default '',
  storage_path text,
  url          text,
  mime         text not null default '',
  size_bytes   bigint not null default 0,
  sort         int not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint form_attachments_payload check (
    (kind = 'file' and storage_path is not null) or
    (kind = 'link' and url is not null)
  )
);
create index if not exists idx_attach_form on public.form_attachments(form_id, sort);
create index if not exists idx_attach_field on public.form_attachments(form_id, field_id);

alter table public.form_attachments enable row level security;

-- อ่าน: สมาชิก tenant ทุกคน (คนหน้างานต้องเปิดดูได้)
drop policy if exists attach_select on public.form_attachments;
create policy attach_select on public.form_attachments
  for select using (tenant_id in (select public.my_tenant_ids()));

-- เพิ่ม/แก้/ลบ: เฉพาะผู้ที่จัดการฟอร์มได้
drop policy if exists attach_manage on public.form_attachments;
create policy attach_manage on public.form_attachments
  for all using (public.can_manage(tenant_id)) with check (public.can_manage(tenant_id));

-- bucket เอกสารแนบ (private — เข้าถึงผ่าน signed URL เท่านั้น)
-- path convention: <tenant_id>/<form_id>/<attachment_id>.<ext>
insert into storage.buckets (id, name, public)
values ('attachments','attachments', false)
on conflict (id) do nothing;

drop policy if exists "krok read tenant attachments" on storage.objects;
create policy "krok read tenant attachments" on storage.objects
  for select using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1]::uuid in (select public.my_tenant_ids())
  );

drop policy if exists "krok write tenant attachments" on storage.objects;
create policy "krok write tenant attachments" on storage.objects
  for insert with check (
    bucket_id = 'attachments'
    and public.can_manage((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "krok update tenant attachments" on storage.objects;
create policy "krok update tenant attachments" on storage.objects
  for update using (
    bucket_id = 'attachments'
    and public.can_manage((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "krok delete tenant attachments" on storage.objects;
create policy "krok delete tenant attachments" on storage.objects
  for delete using (
    bucket_id = 'attachments'
    and public.can_manage((storage.foldername(name))[1]::uuid)
  );

-- ------------------------------------------------------------
-- 2) ทะเบียนอุปกรณ์
--    เครื่องสร้าง device key เองแล้วเก็บไว้ในเครื่อง — ฝั่ง server เก็บเฉพาะ sha256
--    status: pending (รออนุมัติ) / approved (ใช้งานได้) / revoked (ถูกเพิกถอน)
-- ------------------------------------------------------------
create table if not exists public.devices (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  key_hash        text not null,
  name            text not null default '',
  status          text not null default 'pending' check (status in ('pending','approved','revoked')),
  platform        text not null default '',
  first_user_id   uuid references auth.users(id) on delete set null,
  first_user_name text not null default '',
  approved_by     uuid references auth.users(id) on delete set null,
  approved_at     timestamptz,
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (tenant_id, key_hash)
);
create index if not exists idx_devices_tenant on public.devices(tenant_id, status);

alter table public.devices enable row level security;

-- อ่าน/จัดการ: เฉพาะ owner/admin เท่านั้น (เข้มกว่า can_manage ที่รวม designer ด้วย)
-- การลงทะเบียนของคนหน้างานทำผ่าน service role ใน server action
create or replace function public.is_tenant_admin(t uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and tenant_id = t and role in ('owner','admin')
  )
$$;

drop policy if exists devices_select on public.devices;
create policy devices_select on public.devices
  for select using (public.is_tenant_admin(tenant_id));

drop policy if exists devices_manage on public.devices;
create policy devices_manage on public.devices
  for all using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));

-- ล็อคเป็นรายฟอร์ม
alter table public.forms
  add column if not exists require_approved_device boolean not null default false;

-- ผูก submission กับเครื่องที่กรอก
alter table public.submissions
  add column if not exists device_id uuid references public.devices(id) on delete set null;
create index if not exists idx_sub_device on public.submissions(device_id);

-- ------------------------------------------------------------
-- 3) บังคับสิทธิ์ที่ระดับฐานข้อมูล (ไม่ใช่แค่ UI)
--    ฟอร์มที่ไม่ได้ล็อค → ผ่านเสมอ
--    ฟอร์มที่ล็อค      → ต้องส่ง device_id ที่อยู่ใน tenant เดียวกันและ status = approved
-- ------------------------------------------------------------
create or replace function public.device_ok(p_form uuid, p_device uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not coalesce((select f.require_approved_device from public.forms f where f.id = p_form), false)
      then true
    else exists (
      select 1
      from public.devices d
      join public.forms f on f.id = p_form
      where d.id = p_device
        and d.tenant_id = f.tenant_id
        and d.status = 'approved'
    )
  end
$$;

drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions
  for insert with check (
    tenant_id in (select public.my_tenant_ids())
    and submitted_by = auth.uid()
    and public.device_ok(form_id, device_id)
  );
