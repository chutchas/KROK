-- ============================================================
-- KROK · 0026_form_devices
-- ผูกอุปกรณ์กับฟอร์มเป็นรายคู่ (device × form)
--
-- forms.device_scope (ใช้เมื่อ require_approved_device = true เท่านั้น)
--   'any'      → เครื่องไหนก็ได้ที่ "อนุมัติแล้ว" ในองค์กร  (ค่าเริ่มต้น — พฤติกรรมเดิม)
--   'selected' → ต้องเป็นเครื่องที่อนุมัติแล้ว *และ* ถูกผูกกับฟอร์มนี้ใน form_devices
-- ============================================================

alter table public.forms
  add column if not exists device_scope text not null default 'any';

do $$ begin
  alter table public.forms
    add constraint forms_device_scope_check check (device_scope in ('any','selected'));
exception when duplicate_object then null;
end $$;

create table if not exists public.form_devices (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  form_id    uuid not null references public.forms(id) on delete cascade,
  device_id  uuid not null references public.devices(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (form_id, device_id)
);
create index if not exists idx_form_devices_device on public.form_devices(device_id);
create index if not exists idx_form_devices_tenant on public.form_devices(tenant_id);

alter table public.form_devices enable row level security;

-- จัดการได้เฉพาะ owner/admin (เท่ากับตาราง devices)
drop policy if exists form_devices_select on public.form_devices;
create policy form_devices_select on public.form_devices
  for select using (public.is_tenant_admin(tenant_id));

drop policy if exists form_devices_manage on public.form_devices;
create policy form_devices_manage on public.form_devices
  for all using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));

-- ------------------------------------------------------------
-- อัปเดตตัวตัดสินสิทธิ์ (policy submissions_insert เรียกฟังก์ชันนี้อยู่ ไม่ต้องแก้ policy)
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
    when not exists (
      select 1
      from public.devices d
      join public.forms f on f.id = p_form
      where d.id = p_device
        and d.tenant_id = f.tenant_id
        and d.status = 'approved'
    ) then false
    when coalesce((select f.device_scope from public.forms f where f.id = p_form), 'any') = 'any'
      then true
    else exists (
      select 1 from public.form_devices fd
      where fd.form_id = p_form and fd.device_id = p_device
    )
  end
$$;

-- ล้างการผูกที่ไม่ได้ใช้เมื่อฟอร์มเลิกล็อคเครื่อง (กันข้อมูลค้างและกันความเข้าใจผิดในหน้า Matrix)
create or replace function public.clear_form_devices_when_unlocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.require_approved_device = false and old.require_approved_device = true then
    delete from public.form_devices where form_id = new.id;
    new.device_scope := 'any';
  end if;
  return new;
end $$;

drop trigger if exists trg_forms_clear_devices on public.forms;
create trigger trg_forms_clear_devices before update on public.forms
for each row execute function public.clear_form_devices_when_unlocked();
