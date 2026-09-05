-- ============================================================
-- 0013 · จัดการ workspace: เปลี่ยนชื่อ / ลบ
-- rename: owner/admin (can_manage) · delete: owner เท่านั้น
-- ============================================================

-- เปลี่ยนชื่อ workspace
create or replace function public.rename_workspace(p_tenant uuid, p_name text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'ชื่อ workspace ห้ามว่าง';
  end if;
  if not exists (
    select 1 from public.memberships
    where user_id = auth.uid() and tenant_id = p_tenant and role in ('owner','admin')
  ) then
    raise exception 'ไม่มีสิทธิ์เปลี่ยนชื่อ workspace นี้';
  end if;
  update public.tenants set name = trim(p_name) where id = p_tenant;
end;
$$;

-- ลบ workspace (เจ้าของเท่านั้น) — ห้ามลบ workspace สุดท้ายของตัวเอง
create or replace function public.delete_workspace(p_tenant uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  my_count int;
begin
  if not exists (
    select 1 from public.memberships
    where user_id = auth.uid() and tenant_id = p_tenant and role = 'owner'
  ) then
    raise exception 'เฉพาะเจ้าของ workspace เท่านั้นที่ลบได้';
  end if;

  select count(*) into my_count from public.memberships where user_id = auth.uid();
  if my_count <= 1 then
    raise exception 'ลบไม่ได้ — นี่คือ workspace เดียวที่คุณมี';
  end if;

  -- tenants ถูก cascade ไปยัง memberships/forms/audit_log/... ตาม FK on delete cascade
  delete from public.tenants where id = p_tenant;
end;
$$;

grant execute on function public.rename_workspace(uuid, text) to authenticated;
grant execute on function public.delete_workspace(uuid) to authenticated;
