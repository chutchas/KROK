-- ============================================================
-- KROK · 0049_security_hardening  (ตรวจความปลอดภัยรอบ 2 — ด่านที่ฐานข้อมูล)
--
-- 1. memberships — เลิก policy "for all": admin เพิ่มใครก็ได้เข้า workspace ตรง ๆ ผ่าน REST ไม่ได้แล้ว
--    (เพิ่มสมาชิกต้องผ่านคำเชิญ → join_invite เท่านั้น) · แก้/ลบสมาชิกยังทำได้ตามเดิม
-- 2. tenants — ผู้ใช้แก้แถว tenant ตรงผ่าน REST ไม่ได้ (เดิม owner แก้ created_by / plan เองได้
--    = ย้ายโควตาไปกลุ่มคนอื่น / เปลี่ยนแพ็กเกจฟรี) · เปลี่ยนชื่อยังใช้ rename_workspace ได้
-- 3. team_members — เพิ่มสมาชิกทีมได้เฉพาะทีมของ workspace เดียวกัน + ผู้ใช้ต้องเป็นสมาชิก workspace นั้น
--    (เดิม admin ของ workspace A ใส่ตัวเองเข้าทีมของ workspace B ได้ → เห็นงานที่มอบให้ทีมนั้น)
--    + my_team_ids นับเฉพาะทีมที่ถูกต้อง + ลบแถวข้าม workspace ที่อาจมีอยู่แล้ว
-- 4. โควตาที่ฐานข้อมูล: จำนวนฟอร์ม (insert/กู้คืน) + จำนวน workspace ใน create_workspace
--    (เดิมตรวจเฉพาะในแอป — เรียก REST ตรงข้ามได้)
-- 5. รับคำเชิญตอนสมัคร: ต้องยืนยันอีเมลก่อน (กันสมัครด้วยอีเมลคนอื่นเพื่อรับคำเชิญ)
--    ยังไม่ยืนยัน → รอ แล้วเข้าร่วมอัตโนมัติตอนกดยืนยันอีเมล
-- 6. audit_log — ใส่ actor_id เป็นคนอื่นไม่ได้ (กันปลอมประวัติ)
-- 7. avatars — เลิกให้ list ไฟล์ทั้ง bucket (รูปยังเปิดผ่าน public URL ได้ตามเดิม)
-- 8. storage_quota_ok — ไม่เปิดให้ anon เรียก
-- 9. submissions insert — notified_at มาจาก server เท่านั้น
-- 10. invites — ดูรายการคำเชิญได้เฉพาะ owner/admin (เดิมสมาชิกทุกคนเห็นอีเมลที่ถูกเชิญ)
--
-- รันซ้ำได้ · ต้องรันหลัง 0048
-- ============================================================

-- ------------------------------------------------------------
-- 1) memberships
-- ------------------------------------------------------------
drop policy if exists memberships_manage on public.memberships;
drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships
  for update using (public.my_role(tenant_id) in ('owner','admin'))
  with check (public.my_role(tenant_id) in ('owner','admin'));
drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships
  for delete using (public.my_role(tenant_id) in ('owner','admin'));

-- ------------------------------------------------------------
-- 2) tenants — แก้ผ่าน RPC (security definer) / service role เท่านั้น
-- ------------------------------------------------------------
drop policy if exists tenants_update on public.tenants;
revoke insert, update, delete on public.tenants from anon, authenticated;

-- ------------------------------------------------------------
-- 3) team_members
-- ------------------------------------------------------------
drop policy if exists tm_manage on public.team_members;
create policy tm_manage on public.team_members
  for all using (public.can_manage(tenant_id))
  with check (
    public.can_manage(tenant_id)
    and exists (select 1 from public.teams t where t.id = team_id and t.tenant_id = team_members.tenant_id)
    and exists (select 1 from public.memberships m where m.tenant_id = team_members.tenant_id and m.user_id = team_members.user_id)
  );

create or replace function public.my_team_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select tm.team_id
    from public.team_members tm
    join public.teams t on t.id = tm.team_id and t.tenant_id = tm.tenant_id
    join public.memberships m on m.tenant_id = tm.tenant_id and m.user_id = tm.user_id
   where tm.user_id = auth.uid()
$$;

delete from public.team_members tm
 where not exists (select 1 from public.teams t where t.id = tm.team_id and t.tenant_id = tm.tenant_id)
    or not exists (select 1 from public.memberships m where m.tenant_id = tm.tenant_id and m.user_id = tm.user_id);

-- ------------------------------------------------------------
-- 4) โควตา
-- ------------------------------------------------------------
-- ลิมิตตามแพ็กเกจของ "บัญชีผู้ใช้" (ใช้กับ workspace ที่ยังไม่มี เช่น ตอนสร้างใหม่)
create or replace function public._user_plan_limit(p_user uuid, p_name text)
returns bigint
language plpgsql stable security definer set search_path = public as $$
declare k text; e jsonb;
begin
  select coalesce((select plan from public.account_plans where user_id = p_user), 'free') into k;
  select x into e
    from public.platform_plan_settings s, jsonb_array_elements(coalesce(s.plans->'catalog', '[]'::jsonb)) x
   where s.id and x->>'key' in (k, 'free')
   order by (x->>'key' = k) desc
   limit 1;
  if e is null or jsonb_typeof(e->p_name) <> 'number' then return null; end if;
  return floor((e->>p_name)::numeric)::bigint;
end $$;
revoke all on function public._user_plan_limit(uuid, text) from public, anon, authenticated;

-- 4.1) จำนวนฟอร์ม (นับรวมทุก workspace ของเจ้าของ · ไม่นับที่ลบแล้ว · นับฉบับร่างด้วยเหมือนในแอป) — บังคับเฉพาะคำขอจากผู้ใช้
create or replace function public.zz_quota_forms()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim bigint; used bigint;
begin
  -- security definer → current_user = เจ้าของฟังก์ชัน · ใช้ auth.uid() แยกคำขอจากผู้ใช้ (service role ไม่มี uid)
  if auth.uid() is null then return new; end if;
  -- ตรงกับด่านในแอป (saveForm): บังคับตอนสร้างฟอร์มเผยแพร่ใหม่ / กู้คืนฟอร์มเผยแพร่ · ฉบับร่างบันทึกได้ตามเดิม
  if new.deleted_at is not null or new.status is distinct from 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.deleted_at is null then return new; end if;
  lim := public.plan_limit(new.tenant_id, 'maxForms');
  if lim is not null and lim < 999999 then
    select count(*) into used from public.forms
     where tenant_id = any(public.tenant_pool_ids(new.tenant_id)) and deleted_at is null and id <> new.id;
    if used >= lim then
      perform public._quota_fail('forms', format('สร้างฟอร์มได้สูงสุด %s แบบ (รวมทุก workspace ของบัญชี)', lim));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists zz_quota_forms on public.forms;
create trigger zz_quota_forms before insert or update of deleted_at on public.forms
  for each row execute function public.zz_quota_forms();

-- 4.2) จำนวน workspace
create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_tenant uuid;
  disp text;
  lim bigint;
  owned int;
  all_menus jsonb := '["studio","forms","approvals","dashboard","team","billing","integrations","ai"]'::jsonb;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'ต้องระบุชื่อ workspace'; end if;
  if length(trim(p_name)) > 60 then raise exception 'ชื่อยาวเกินไป (สูงสุด 60 ตัวอักษร)'; end if;

  lim := public._user_plan_limit(auth.uid(), 'maxWorkspaces');
  if lim is not null and lim < 999999 then
    owned := coalesce(array_length(public.owner_tenant_ids(auth.uid()), 1), 0);
    if owned >= lim then
      perform public._quota_fail('workspaces', format('สร้าง workspace ได้สูงสุด %s', lim));
    end if;
  end if;

  insert into public.tenants (name, created_by) values (trim(p_name), auth.uid())
    returning id into new_tenant;

  insert into public.tenant_roles (tenant_id, key, name, can_manage, menus, is_system, sort) values
    (new_tenant, 'owner', 'Owner', true, all_menus, true, 0),
    (new_tenant, 'admin', 'Admin', true, all_menus, true, 10),
    (new_tenant, 'user', 'User', false, '["forms","dashboard"]'::jsonb, true, 20);

  select coalesce(nullif(name,''), nullif(email,'')) into disp
    from public.memberships where user_id = auth.uid() limit 1;

  insert into public.memberships (tenant_id, user_id, role, role_key, name, email)
    values (new_tenant, auth.uid(), 'owner', 'owner', disp,
            (select email from public.memberships where user_id = auth.uid() limit 1));
  return new_tenant;
end $$;

-- ------------------------------------------------------------
-- 5) รับคำเชิญเฉพาะอีเมลที่ยืนยันแล้ว
-- ------------------------------------------------------------
-- จัดสรรผู้ใช้: รับคำเชิญที่ค้าง (ถ้ายืนยันอีเมลแล้ว) · ไม่มีอะไรให้เข้าร่วมและยังไม่มี workspace = สร้างของตัวเอง
create or replace function public._provision_user(p_user uuid, p_email text, p_meta jsonb, p_confirmed boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  disp text;
  org_name text;
  new_tenant uuid;
  joined int := 0;
  all_menus jsonb := '["studio","forms","approvals","dashboard","team","billing","integrations","ai"]'::jsonb;
begin
  disp := coalesce(nullif(p_meta->>'display_name',''), split_part(p_email,'@',1));

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
    return;  -- มีคำเชิญรออยู่ → รอยืนยันอีเมลก่อน แล้วค่อยเข้าร่วม (trigger ข้อล่าง)
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._provision_user(new.id, new.email, coalesce(new.raw_user_meta_data, '{}'::jsonb), new.email_confirmed_at is not null);
  return new;
end $$;

-- ยืนยันอีเมลแล้ว → เข้าร่วมคำเชิญที่ค้าง (ห้ามทำให้การยืนยันล้ม: error = เตือนแล้วผ่าน)
create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public._provision_user(new.id, new.email, coalesce(new.raw_user_meta_data, '{}'::jsonb), true);
  exception when others then
    raise warning 'handle_user_confirmed: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- ------------------------------------------------------------
-- 6) audit_log — actor ต้องเป็นตัวเอง
-- ------------------------------------------------------------
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert with check (
    tenant_id in (select public.my_tenant_ids())
    and actor_id = auth.uid()
  );

-- ------------------------------------------------------------
-- 7) avatars — อ่านผ่าน API ได้เฉพาะโฟลเดอร์ตัวเอง (upsert ต้องใช้) · public URL ยังใช้ได้เพราะ bucket เป็น public
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "krok avatars public read" on storage.objects';
    execute 'drop policy if exists "krok avatars read own" on storage.objects';
    execute $p$create policy "krok avatars read own" on storage.objects
               for select using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;

-- ------------------------------------------------------------
-- 8) storage_quota_ok — ผู้ใช้ที่ล็อกอินเท่านั้น
-- ------------------------------------------------------------
revoke all on function public.storage_quota_ok(text, text) from public, anon;
grant execute on function public.storage_quota_ok(text, text) to authenticated;

-- ------------------------------------------------------------
-- 9) submissions insert — notified_at มาจาก server
-- ------------------------------------------------------------
create or replace function public.zz_guard_submission_insert()
returns trigger language plpgsql as $$
declare f record;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  select tenant_id, title, icon, requires_approval, approval_chain into f
    from public.forms where id = new.form_id;
  if not found or f.tenant_id <> new.tenant_id then
    raise exception 'ไม่พบฟอร์ม';
  end if;
  new.form_title := coalesce(f.title, new.form_title);
  new.form_icon := coalesce(f.icon, new.form_icon);
  new.approval_status := case when f.requires_approval then 'pending' else 'none' end;
  new.approval_chain := case when f.requires_approval then coalesce(f.approval_chain, '[]'::jsonb) else '[]'::jsonb end;
  new.approval_step := 0;
  new.approval_history := '[]'::jsonb;
  new.reviewed_by := null;
  new.reviewer_name := null;
  new.reviewed_at := null;
  new.review_note := null;
  new.ext_ref := null;
  new.source := null;
  new.case_id := null;
  new.notified_at := null;
  return new;
end $$;

-- ------------------------------------------------------------
-- 10) invites — owner/admin เท่านั้น
-- ------------------------------------------------------------
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select using (public.my_role(tenant_id) in ('owner','admin'));
