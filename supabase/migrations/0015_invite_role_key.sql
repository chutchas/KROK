-- ============================================================
-- 0015 · เชิญสมาชิกพร้อม custom role (role_key)
-- เพิ่ม invites.role_key + handle_new_user ใช้ role_key ถ้ามี
-- ============================================================

alter table public.invites add column if not exists role_key text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  disp text;
  org_name text;
  new_tenant uuid;
  joined int := 0;
  rk text;
  can_mng boolean;
  enum_role membership_role;
  all_menus jsonb := '["studio","forms","approvals","dashboard","team","billing","integrations","ai"]'::jsonb;
begin
  disp := coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1));

  for inv in
    select * from public.invites
    where lower(email) = lower(new.email) and accepted_at is null
  loop
    -- ถ้า invite ระบุ role_key และมี role นั้นจริงใน tenant → ใช้ role_key + derive enum จาก can_manage
    rk := null;
    if inv.role_key is not null then
      select key, can_manage into rk, can_mng
      from public.tenant_roles
      where tenant_id = inv.tenant_id and key = inv.role_key;
    end if;

    if rk is not null then
      enum_role := case when rk = 'owner' then 'owner'::membership_role
                        when can_mng then 'admin'::membership_role
                        else 'operator'::membership_role end;
      insert into public.memberships (tenant_id, user_id, role, role_key, email, name)
        values (inv.tenant_id, new.id, enum_role, rk, new.email, disp)
        on conflict (tenant_id, user_id) do nothing;
    else
      -- fallback: ตาม enum role เดิม
      insert into public.memberships (tenant_id, user_id, role, role_key, email, name)
        values (inv.tenant_id, new.id, inv.role,
                case inv.role when 'owner' then 'owner' when 'admin' then 'admin' when 'designer' then 'admin' else 'user' end,
                new.email, disp)
        on conflict (tenant_id, user_id) do nothing;
    end if;

    update public.invites set accepted_at = now() where id = inv.id;
    joined := joined + 1;
  end loop;

  if joined = 0 then
    org_name := coalesce(nullif(new.raw_user_meta_data->>'org_name',''), split_part(new.email,'@',1) || ' Workspace');
    insert into public.tenants (name, created_by) values (org_name, new.id) returning id into new_tenant;
    insert into public.tenant_roles (tenant_id, key, name, can_manage, menus, is_system, sort) values
      (new_tenant, 'owner', 'Owner', true, all_menus, true, 0),
      (new_tenant, 'admin', 'Admin', true, all_menus, true, 10),
      (new_tenant, 'user', 'User', false, '["forms","dashboard"]'::jsonb, true, 20);
    insert into public.memberships (tenant_id, user_id, role, role_key, email, name)
      values (new_tenant, new.id, 'owner', 'owner', new.email, disp);
  end if;
  return new;
end $$;
