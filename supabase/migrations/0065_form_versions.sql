-- ============================================================
-- KROK · 0065_form_versions
-- ประวัติเวอร์ชันฟอร์ม
--  - แก้ schema (ช่อง/ขั้นตอน/ชื่อ/รูปแบบกระดาษ ฯลฯ) → forms.version +1 อัตโนมัติ (trigger)
--    เปลี่ยนแค่สิทธิ์แชร์/สถานะ/ขั้นอนุมัติ = ไม่นับเป็นเวอร์ชันใหม่
--  - ทุกเวอร์ชันเก็บ snapshot ลง form_versions (ใคร/เมื่อไหร่/หมายเหตุ) · เก็บล่าสุด 100 เวอร์ชันต่อฟอร์ม
--  - ใบที่ส่งบันทึก form_version อยู่แล้ว → เปิดดูฟอร์มเวอร์ชันที่กรอกจริงได้
--  - ฟอร์มเดิมทั้งหมด: บันทึกเวอร์ชันปัจจุบันเป็นจุดเริ่มต้นของประวัติ
-- อ่านได้เฉพาะผู้ดูแลฟอร์ม (owner/admin/designer) · เขียนผ่าน trigger เท่านั้น (แก้ได้แค่หมายเหตุ)
-- รันซ้ำได้ · ต้องรันหลัง 0064
-- ============================================================

create table if not exists public.form_versions (
  form_id        uuid not null references public.forms(id) on delete cascade,
  version        int  not null,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  title          text not null default '',
  icon           text not null default '📋',
  schema         jsonb not null,
  saved_by       uuid references auth.users(id) on delete set null,
  saved_by_name  text not null default '',
  saved_at       timestamptz not null default now(),
  note           text not null default '' check (char_length(note) <= 300),
  primary key (form_id, version)
);
create index if not exists idx_form_versions_tenant on public.form_versions(tenant_id, saved_at desc);

alter table public.form_versions enable row level security;
revoke all on public.form_versions from anon, authenticated;
grant select on public.form_versions to authenticated;
grant update (note) on public.form_versions to authenticated;

drop policy if exists fv_select on public.form_versions;
create policy fv_select on public.form_versions
  for select using (public.can_manage(tenant_id));

drop policy if exists fv_note on public.form_versions;
create policy fv_note on public.form_versions
  for update using (public.can_manage(tenant_id)) with check (public.can_manage(tenant_id));

-- ① ก่อนบันทึก: schema เปลี่ยน → เลขเวอร์ชันใหม่ (ไม่เชื่อเลขที่ส่งมาเอง)
create or replace function public.forms_bump_version()
returns trigger
language plpgsql as $$
begin
  if new.schema is distinct from old.schema then
    new.version := greatest(coalesce(old.version, 1), coalesce((select max(v.version) from public.form_versions v where v.form_id = old.id), 0)) + 1;
  else
    new.version := old.version;
  end if;
  return new;
end $$;
drop trigger if exists forms_bump_version on public.forms;
create trigger forms_bump_version before update on public.forms
  for each row execute function public.forms_bump_version();

-- ② หลังบันทึก: เก็บ snapshot ของเวอร์ชันใหม่ + ตัดของเก่าเกิน 100
create or replace function public.forms_snapshot_version()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := '';
begin
  if tg_op = 'UPDATE' and new.version = old.version then return null; end if;
  if auth.uid() is not null then
    select coalesce(nullif(m.name, ''), m.email, '') into v_name
      from public.memberships m where m.tenant_id = new.tenant_id and m.user_id = auth.uid();
  end if;
  insert into public.form_versions (form_id, version, tenant_id, title, icon, schema, saved_by, saved_by_name)
  values (new.id, new.version, new.tenant_id, new.title, new.icon, new.schema, coalesce(auth.uid(), new.created_by), coalesce(v_name, ''))
  on conflict (form_id, version) do nothing;
  delete from public.form_versions v
   where v.form_id = new.id
     and v.version <= new.version - 100;
  return null;
end $$;
drop trigger if exists forms_snapshot_version on public.forms;
create trigger forms_snapshot_version after insert or update on public.forms
  for each row execute function public.forms_snapshot_version();

-- ③ ฟอร์มเดิม: เวอร์ชันปัจจุบัน = จุดเริ่มต้นประวัติ
insert into public.form_versions (form_id, version, tenant_id, title, icon, schema, saved_by, saved_by_name, saved_at, note)
select f.id, coalesce(f.version, 1), f.tenant_id, f.title, f.icon, f.schema, f.created_by, '', f.updated_at, 'เวอร์ชันก่อนเปิดระบบประวัติ'
  from public.forms f
 where f.deleted_at is null
on conflict (form_id, version) do nothing;
