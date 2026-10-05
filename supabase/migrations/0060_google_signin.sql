-- ============================================================
-- KROK · 0060_google_signin
-- รองรับสมัคร/เข้าสู่ระบบด้วย Google (Supabase Auth provider)
--  - ชื่อที่แสดง: ใช้ full_name / name จาก Google เมื่อไม่มี display_name
--  - สมัครด้วย Google และอีเมลมีคำเชิญค้าง → เข้าร่วม workspace ที่เชิญ (ไม่สร้าง workspace ใหม่)
--    ไม่มีคำเชิญ → สร้าง workspace ใหม่เหมือนสมัครด้วยอีเมล
-- ไม่แก้ trigger (handle_new_user / handle_user_confirmed เรียกฟังก์ชันนี้อยู่แล้ว)
-- รันซ้ำได้ · ต้องรันหลัง 0059
-- ============================================================

create or replace function public._provision_user(p_user uuid, p_email text, p_meta jsonb, p_confirmed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  inv record;
  disp text;
  org_name text;
  new_tenant uuid;
  joined int := 0;
  -- สมัครด้วย Google (OAuth): ไม่มีหน้าให้เลือก "สร้าง workspace / เข้าร่วม" → มีคำเชิญค้าง = เข้าร่วมคำเชิญ
  -- (Google ยืนยันความเป็นเจ้าของอีเมลแล้ว เทียบเท่าการยืนยันอีเมล)
  oauth boolean := (p_meta ? 'provider_id') or (p_meta ? 'iss');
  via_invite boolean := coalesce(p_meta->>'via_invite', '') in ('true', '1') or (oauth and p_confirmed);
  all_menus jsonb := '["studio","forms","approvals","dashboard","team","billing","integrations","ai"]'::jsonb;
begin
  disp := coalesce(nullif(p_meta->>'display_name',''), nullif(p_meta->>'full_name',''), nullif(p_meta->>'name',''), split_part(p_email,'@',1));

  if via_invite then
    if p_confirmed then
      for inv in
        select id from public.invites
        where lower(email) = lower(p_email) and accepted_at is null
      loop
        if public.join_invite(inv.id, p_user, p_email, disp) is not null then
          joined := joined + 1;
        end if;
      end loop;
    elsif exists (select 1 from public.invites where lower(email) = lower(p_email) and accepted_at is null) then
      return;  -- รอยืนยันอีเมลก่อน แล้วค่อยเข้าร่วม
    end if;
  end if;

  if joined = 0 and not exists (select 1 from public.memberships where user_id = p_user) then
    org_name := coalesce(nullif(p_meta->>'org_name',''), split_part(p_email,'@',1) || ' Workspace');
    insert into public.tenants (name, created_by) values (org_name, p_user) returning id into new_tenant;
    insert into public.tenant_roles (tenant_id, key, name, can_manage, menus, is_system, sort) values
      (new_tenant, 'owner', 'Owner', true, all_menus, true, 0),
      (new_tenant, 'admin', 'Admin', true, all_menus, true, 10),
      (new_tenant, 'user', 'User', false, '["forms","dashboard"]'::jsonb, true, 20);
    insert into public.memberships (tenant_id, user_id, role, role_key, email, name)
      values (new_tenant, p_user, 'owner', 'owner', p_email, disp);
  end if;
end $$;
revoke all on function public._provision_user(uuid, text, jsonb, boolean) from public, anon, authenticated;
