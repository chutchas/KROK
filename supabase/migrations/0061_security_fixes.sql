-- ============================================================
-- KROK · 0061_security_fixes
-- 1) เอกสารแนบ: ฟอร์มต้องเป็นของ workspace เดียวกับแถว (กันคนนอกแปะลิงก์/ไฟล์ลงฟอร์มสาธารณะของลูกค้าอื่น)
--    + storage: โฟลเดอร์ <tenant>/<form>/ ต้องเป็นฟอร์มของ tenant นั้น · ลบแถวที่ไม่ตรงอยู่แล้ว
-- 2) สมัครด้วย Google ไม่เข้าคำเชิญอัตโนมัติ (ย้อนส่วนนั้นของ 0060 — ชื่อจาก Google ยังใช้ได้)
-- 3) ใบที่ส่งแล้ว: ห้ามแก้ filled_at / notified_at ผ่าน REST
-- 4) รูปในใบที่ส่ง/แบบร่าง/งาน: เฉพาะ jpeg/png/webp (ไม่รับ SVG ที่ฝังสคริปต์ได้)
-- รันซ้ำได้ · ต้องรันหลัง 0060
-- ============================================================

-- 1) เอกสารแนบ
create or replace function public.form_in_tenant(p_form uuid, p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.forms where id = p_form and tenant_id = p_tenant)
$$;
revoke all on function public.form_in_tenant(uuid, uuid) from public, anon;
grant execute on function public.form_in_tenant(uuid, uuid) to authenticated, service_role;

delete from public.form_attachments a
 where not exists (select 1 from public.forms f where f.id = a.form_id and f.tenant_id = a.tenant_id);

drop policy if exists attach_manage on public.form_attachments;
create policy attach_manage on public.form_attachments
  for all using (public.can_manage(tenant_id))
  with check (public.can_manage(tenant_id) and public.form_in_tenant(form_id, tenant_id));

do $$
begin
  if to_regclass('storage.objects') is null then return; end if;
  execute 'drop policy if exists "krok write tenant attachments" on storage.objects';
  execute $p$create policy "krok write tenant attachments" on storage.objects for insert with check (
    bucket_id = 'attachments'
    and public.can_manage(public.try_uuid((storage.foldername(name))[1]))
    and public.form_in_tenant(public.try_uuid((storage.foldername(name))[2]), public.try_uuid((storage.foldername(name))[1])))$p$;
end $$;

-- 2) สมัครด้วย Google
create or replace function public._provision_user(p_user uuid, p_email text, p_meta jsonb, p_confirmed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  inv record;
  disp text;
  org_name text;
  new_tenant uuid;
  joined int := 0;
  -- สมัครด้วย Google ไม่เข้าคำเชิญอัตโนมัติ (กัน "เชิญดัก": คนแปลกหน้าเชิญอีเมลไว้ก่อน) — ผู้ใช้กดรับเองในแอป
  via_invite boolean := coalesce(p_meta->>'via_invite', '') in ('true', '1');
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

-- 3) ช่องที่ห้ามแก้ (ต่อจาก 0036)
create or replace function public.zz_guard_submission_update()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.answers          is distinct from old.answers
    or new.fails            is distinct from old.fails
    or new.result           is distinct from old.result
    or new.submitted_by     is distinct from old.submitted_by
    or new.user_name        is distinct from old.user_name
    or new.tenant_id        is distinct from old.tenant_id
    or new.form_id          is distinct from old.form_id
    or new.form_version     is distinct from old.form_version
    or new.submitted_at     is distinct from old.submitted_at
    or new.filled_at        is distinct from old.filled_at
    or new.notified_at      is distinct from old.notified_at
    or new.duration_s       is distinct from old.duration_s
    or new.device_id        is distinct from old.device_id
    or new.ext_ref          is distinct from old.ext_ref
    or new.source           is distinct from old.source
    or new.case_id          is distinct from old.case_id
    or new.approval_status  is distinct from old.approval_status
    or new.approval_step    is distinct from old.approval_step
    or new.approval_chain   is distinct from old.approval_chain
    or new.approval_history is distinct from old.approval_history
    or new.reviewed_by      is distinct from old.reviewed_by
    or new.reviewer_name    is distinct from old.reviewer_name
    or new.reviewed_at      is distinct from old.reviewed_at
    or new.review_note      is distinct from old.review_note
  ) then
    raise exception 'แก้ไขข้อมูลของเอกสารที่ส่งแล้วไม่ได้ (การอนุมัติต้องทำผ่านหน้าอนุมัติ)';
  end if;
  return new;
end $$;

-- 4) ชนิดไฟล์รูป
do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
   where id in ('submissions', 'drafts', 'cases');
exception when undefined_column then
  raise notice 'storage.buckets ไม่มีคอลัมน์ allowed_mime_types — ข้าม';
end $$;
