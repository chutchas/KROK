-- KROK · 0023_session_bundle
-- รวม session ให้เหลือ round-trip เดียว: memberships + tenants + profile + tenant_role
-- ของ workspace ที่ active — แทนที่ 3-4 query ที่เคยยิงเรียงกันใน src/lib/session.ts
--
-- คืน jsonb:
--   { memberships:[{tenant_id,role,role_key,tenant_name,created_at}...],
--     profile:{platform_role,avatar_url},
--     active:{tenant_id,role,role_key,tenant_name,role_name,can_manage,menus} }
-- active = null ถ้าไม่มี membership. menus = null หมายถึง "ทุกเมนู" (owner).
-- ค่า p_wanted = tenant_id จาก cookie krok_ws (null = ใช้ workspace แรก)

create or replace function public.session_bundle(p_wanted uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid   uuid := auth.uid();
  v_active record;
  v_rolekey text;
  v_role_row record;
  v_menus jsonb;
  v_can_manage boolean;
  v_role_name text;
  v_profile record;
  v_memberships jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('memberships', '[]'::jsonb, 'profile', null, 'active', null);
  end if;

  -- รายชื่อ workspace ทั้งหมด (เรียงตามเวลาเข้าร่วม)
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'tenant_id',   m.tenant_id,
             'role',        m.role,
             'role_key',    m.role_key,
             'tenant_name', coalesce(t.name, 'องค์กร'),
             'created_at',  m.created_at
           ) order by m.created_at asc
         ), '[]'::jsonb)
    into v_memberships
    from public.memberships m
    left join public.tenants t on t.id = m.tenant_id
   where m.user_id = v_uid;

  -- profile (platform_role + avatar)
  select platform_role, avatar_url into v_profile
    from public.profiles where user_id = v_uid;

  -- workspace ที่ active: p_wanted ถ้าตรง, ไม่งั้น workspace แรก
  select m.tenant_id, m.role, m.role_key, coalesce(t.name,'องค์กร') as tenant_name
    into v_active
    from public.memberships m
    left join public.tenants t on t.id = m.tenant_id
   where m.user_id = v_uid
     and (p_wanted is not null and m.tenant_id = p_wanted)
   limit 1;

  if v_active.tenant_id is null then
    select m.tenant_id, m.role, m.role_key, coalesce(t.name,'องค์กร') as tenant_name
      into v_active
      from public.memberships m
      left join public.tenants t on t.id = m.tenant_id
     where m.user_id = v_uid
     order by m.created_at asc
     limit 1;
  end if;

  if v_active.tenant_id is null then
    return jsonb_build_object(
      'memberships', v_memberships,
      'profile', case when v_profile is null then null
                   else jsonb_build_object('platform_role', v_profile.platform_role,
                                           'avatar_url', v_profile.avatar_url) end,
      'active', null
    );
  end if;

  v_rolekey := coalesce(v_active.role_key,
                        case when v_active.role = 'operator' then 'user' else v_active.role::text end);

  select name, can_manage, menus into v_role_row
    from public.tenant_roles
   where tenant_id = v_active.tenant_id and key = v_rolekey
   limit 1;

  if v_rolekey = 'owner' then
    v_menus := null;                    -- sentinel: ทุกเมนู
    v_can_manage := true;
    v_role_name := coalesce(v_role_row.name, 'owner');
  else
    v_menus := coalesce(v_role_row.menus, '["forms","dashboard"]'::jsonb);
    v_can_manage := coalesce(v_role_row.can_manage, v_active.role <> 'operator');
    v_role_name := coalesce(v_role_row.name, v_rolekey);
  end if;

  return jsonb_build_object(
    'memberships', v_memberships,
    'profile', case when v_profile is null then null
                 else jsonb_build_object('platform_role', v_profile.platform_role,
                                         'avatar_url', v_profile.avatar_url) end,
    'active', jsonb_build_object(
      'tenant_id',   v_active.tenant_id,
      'role',        v_active.role,
      'role_key',    v_rolekey,
      'tenant_name', v_active.tenant_name,
      'role_name',   v_role_name,
      'can_manage',  v_can_manage,
      'menus',       v_menus
    )
  );
end;
$$;

grant execute on function public.session_bundle(uuid) to authenticated;
