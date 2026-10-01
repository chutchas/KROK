-- ============================================================
-- KROK · 0039_invite_teams
-- 1) เชิญพร้อมเลือกทีม/แผนก (ไม่บังคับ) — invites.team_ids
-- 2) รวมขั้นตอน "รับคำเชิญ" เป็นฟังก์ชันเดียว (join_invite) ใช้ทั้งตอนสมัครใหม่และตอนกดรับ
-- 3) คนที่มีบัญชีอยู่แล้ว: ดูคำเชิญของตัวเอง / กดเข้าร่วม / ปฏิเสธ (my_pending_invites, accept_invite, decline_invite)
--    เดิมคำเชิญทำงานเฉพาะตอนสมัครใหม่ → คนที่มีบัญชีแล้วไม่เคยได้เข้า workspace
-- ต้องรันหลัง 0035
-- ============================================================

alter table public.invites add column if not exists team_ids uuid[] not null default '{}';

-- ------------------------------------------------------------
-- join_invite: เพิ่มผู้ใช้เข้า tenant ตามคำเชิญ (+ ทีม) แล้วปิดคำเชิญ
-- ภายในเท่านั้น (ไม่เปิดให้ REST เรียก)
-- ------------------------------------------------------------
create or replace function public.join_invite(p_invite uuid, p_user uuid, p_email text, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  rk text;
  can_mng boolean;
  enum_role membership_role;
begin
  select * into inv from public.invites where id = p_invite and accepted_at is null for update;
  if not found then return null; end if;

  -- role_key ที่ยังมีอยู่จริงใน tenant → ใช้ role_key + enum จาก can_manage; ไม่งั้น fallback ตาม enum เดิม
  rk := null;
  if inv.role_key is not null then
    select key, can_manage into rk, can_mng from public.tenant_roles where tenant_id = inv.tenant_id and key = inv.role_key;
  end if;
  if rk is not null then
    enum_role := case when rk = 'owner' then 'owner'::membership_role when can_mng then 'admin'::membership_role else 'operator'::membership_role end;
  else
    enum_role := inv.role;
    rk := case inv.role when 'owner' then 'owner' when 'admin' then 'admin' when 'designer' then 'admin' else 'user' end;
  end if;

  insert into public.memberships (tenant_id, user_id, role, role_key, email, name)
    values (inv.tenant_id, p_user, enum_role, rk, p_email, p_name)
    on conflict (tenant_id, user_id) do nothing;

  -- ทีมที่เลือกตอนเชิญ (ข้ามทีมที่ถูกลบไปแล้ว / ไม่ใช่ของ tenant นี้)
  insert into public.team_members (team_id, user_id, tenant_id)
    select t.id, p_user, inv.tenant_id
    from public.teams t
    where t.tenant_id = inv.tenant_id and t.id = any(coalesce(inv.team_ids, '{}'))
    on conflict do nothing;

  update public.invites set accepted_at = now() where id = inv.id;
  return inv.tenant_id;
end $$;

revoke all on function public.join_invite(uuid, uuid, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- handle_new_user: เหมือน 0015 แต่ใช้ join_invite (ได้ทีมด้วย)
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  disp text;
  org_name text;
  new_tenant uuid;
  joined int := 0;
  all_menus jsonb := '["studio","forms","approvals","dashboard","team","billing","integrations","ai"]'::jsonb;
begin
  disp := coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1));

  for inv in
    select id from public.invites
    where lower(email) = lower(new.email) and accepted_at is null
  loop
    if public.join_invite(inv.id, new.id, new.email, disp) is not null then
      joined := joined + 1;
    end if;
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

-- ------------------------------------------------------------
-- คำเชิญของผู้ใช้ที่ล็อกอินอยู่ (อีเมลต้องยืนยันแล้ว — กันคนสมัครด้วยอีเมลคนอื่นมารับคำเชิญ)
-- ------------------------------------------------------------
create or replace function public.my_pending_invites()
returns table (id uuid, tenant_id uuid, tenant_name text, role_name text, invited_by_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.tenant_id, t.name,
         coalesce(r.name, i.role_key, i.role::text),
         coalesce(nullif(m.name, ''), m.email),
         i.created_at
  from public.invites i
  join auth.users u on u.id = auth.uid()
  join public.tenants t on t.id = i.tenant_id
  left join public.tenant_roles r on r.tenant_id = i.tenant_id and r.key = i.role_key
  left join public.memberships m on m.tenant_id = i.tenant_id and m.user_id = i.invited_by
  where i.accepted_at is null
    and lower(i.email) = lower(u.email)
    and u.email_confirmed_at is not null
    and not exists (select 1 from public.memberships x where x.tenant_id = i.tenant_id and x.user_id = u.id)
  order by i.created_at desc;
$$;

create or replace function public.accept_invite(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u record;
  inv public.invites;
  tid uuid;
begin
  select id, email, email_confirmed_at, raw_user_meta_data into u from auth.users where id = auth.uid();
  if u.id is null then raise exception 'unauthorized'; end if;
  if u.email_confirmed_at is null then raise exception 'ต้องยืนยันอีเมลก่อนรับคำเชิญ'; end if;

  select * into inv from public.invites where id = p_id and accepted_at is null;
  if not found or lower(inv.email) <> lower(u.email) then raise exception 'ไม่พบคำเชิญนี้ หรือคำเชิญถูกใช้ไปแล้ว'; end if;

  tid := public.join_invite(inv.id, u.id, u.email,
    coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), split_part(u.email, '@', 1)));
  if tid is null then raise exception 'ไม่พบคำเชิญนี้ หรือคำเชิญถูกใช้ไปแล้ว'; end if;
  return tid;
end $$;

create or replace function public.decline_invite(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare em text;
begin
  select email into em from auth.users where id = auth.uid();
  if em is null then raise exception 'unauthorized'; end if;
  delete from public.invites where id = p_id and accepted_at is null and lower(email) = lower(em);
end $$;

revoke all on function public.my_pending_invites() from public, anon;
revoke all on function public.accept_invite(uuid) from public, anon;
revoke all on function public.decline_invite(uuid) from public, anon;
grant execute on function public.my_pending_invites() to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.decline_invite(uuid) to authenticated;
