-- ============================================================
-- KROK · 0035_security_hardening
-- ปิดช่องโหว่ที่เรียก Supabase REST (PostgREST) ตรงด้วย anon key + token ของผู้ใช้ได้
-- (ด่านในแอปอย่างเดียวไม่พอ — ต้องบังคับที่ฐานข้อมูล)
--
-- 1. profiles.platform_role — ผู้ใช้ทั่วไปตั้งตัวเองเป็น platform_admin ไม่ได้
-- 2. memberships — admin ตั้งตัวเอง/คนอื่นเป็น owner หรือถอด/ลบ owner ไม่ได้ (ต้องเป็น owner)
-- 3. invites — เชิญเป็น owner ได้เฉพาะ owner
-- 4. submissions (insert) — สถานะอนุมัติ/ลำดับผู้อนุมัติ/ชื่อฟอร์ม มาจากฟอร์มเสมอ ไม่เชื่อค่าจาก client
-- 5. submissions (update) — ข้อมูลที่ส่งแล้ว (คำตอบ/ผล/ผู้ส่ง) แก้ผ่าน REST ไม่ได้ แก้ได้เฉพาะช่องการอนุมัติ
-- 6. index รายงานรายฟอร์ม
--
-- บังคับเฉพาะคำขอจากผู้ใช้ผ่าน REST (current_user = authenticated)
-- service role (งานฝั่ง server) และฟังก์ชัน security definer ทำงานได้ตามเดิม
-- ต้องรันหลัง 0034
-- ============================================================

-- ------------------------------------------------------------
-- 1) platform_role
-- ------------------------------------------------------------
create or replace function public.zz_guard_platform_role()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_platform_admin() then
    if tg_op = 'INSERT' then
      new.platform_role := 'user';
    elsif new.platform_role is distinct from old.platform_role then
      raise exception 'ไม่มีสิทธิ์เปลี่ยน platform role';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists zz_guard_platform_role on public.profiles;
create trigger zz_guard_platform_role before insert or update on public.profiles
  for each row execute function public.zz_guard_platform_role();

-- ------------------------------------------------------------
-- 2) memberships: การตั้ง/ถอด/ลบ owner ต้องทำโดย owner
-- ------------------------------------------------------------
create or replace function public.zz_guard_membership_owner()
returns trigger language plpgsql as $$
declare
  is_owner boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  is_owner := public.my_role(coalesce(new.tenant_id, old.tenant_id)) = 'owner';

  if tg_op = 'INSERT' then
    if (new.role = 'owner' or new.role_key = 'owner') and not is_owner
       and exists (select 1 from public.memberships m where m.tenant_id = new.tenant_id) then
      raise exception 'เพิ่มสมาชิกเป็น owner ได้เฉพาะ owner';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id or new.user_id is distinct from old.user_id then
      raise exception 'ย้ายสมาชิกข้าม workspace ไม่ได้';
    end if;
    if not is_owner and (
      (new.role = 'owner') is distinct from (old.role = 'owner')
      or (new.role_key = 'owner') is distinct from (old.role_key = 'owner')
    ) then
      raise exception 'ตั้งหรือถอด owner ได้เฉพาะ owner';
    end if;
    return new;
  end if;

  -- DELETE: ลบ owner ได้เฉพาะ owner (ออกจาก workspace เองได้)
  if old.role = 'owner' and not is_owner and old.user_id is distinct from auth.uid() then
    raise exception 'ลบ owner ได้เฉพาะ owner';
  end if;
  return old;
end $$;

drop trigger if exists zz_guard_membership_owner on public.memberships;
create trigger zz_guard_membership_owner before insert or update or delete on public.memberships
  for each row execute function public.zz_guard_membership_owner();

-- ------------------------------------------------------------
-- 3) invites: เชิญเป็น owner ได้เฉพาะ owner
-- ------------------------------------------------------------
create or replace function public.zz_guard_invite_owner()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.role = 'owner' or new.role_key = 'owner')
     and public.my_role(new.tenant_id) is distinct from 'owner' then
    raise exception 'เชิญเป็น owner ได้เฉพาะ owner';
  end if;
  return new;
end $$;

drop trigger if exists zz_guard_invite_owner on public.invites;
create trigger zz_guard_invite_owner before insert or update on public.invites
  for each row execute function public.zz_guard_invite_owner();

-- ------------------------------------------------------------
-- 4) submissions insert: ค่าที่ต้องมาจากฟอร์ม ไม่ใช่จาก client
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
  new.ext_ref := null;   -- มาได้จาก API รับข้อมูลเข้า (service role) เท่านั้น
  new.source := null;
  new.case_id := null;   -- ผูกโดย case_complete เท่านั้น
  return new;
end $$;

drop trigger if exists zz_guard_submission_insert on public.submissions;
create trigger zz_guard_submission_insert before insert on public.submissions
  for each row execute function public.zz_guard_submission_insert();

-- ------------------------------------------------------------
-- 5) submissions update: ข้อมูลที่ส่งแล้วแก้ผ่าน REST ไม่ได้
--    แก้ได้: ช่องการอนุมัติ (approvals) + ชื่อ/ไอคอนฟอร์ม (Studio ซิงก์ชื่อใหม่)
-- ------------------------------------------------------------
create or replace function public.zz_guard_submission_update()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.answers      is distinct from old.answers
    or new.fails        is distinct from old.fails
    or new.result       is distinct from old.result
    or new.submitted_by is distinct from old.submitted_by
    or new.user_name    is distinct from old.user_name
    or new.tenant_id    is distinct from old.tenant_id
    or new.form_id      is distinct from old.form_id
    or new.form_version is distinct from old.form_version
    or new.submitted_at is distinct from old.submitted_at
    or new.duration_s   is distinct from old.duration_s
    or new.device_id    is distinct from old.device_id
    or new.ext_ref      is distinct from old.ext_ref
    or new.source       is distinct from old.source
    or new.case_id      is distinct from old.case_id
  ) then
    raise exception 'แก้ไขข้อมูลของเอกสารที่ส่งแล้วไม่ได้';
  end if;
  return new;
end $$;

drop trigger if exists zz_guard_submission_update on public.submissions;
create trigger zz_guard_submission_update before update on public.submissions
  for each row execute function public.zz_guard_submission_update();

-- ------------------------------------------------------------
-- 6) index: รายงาน/ส่งออก/วิดเจ็ตรายฟอร์ม (กรอง tenant + form เรียงเวลา)
--    ตารางใหญ่บน production: รันแยกด้วย CREATE INDEX CONCURRENTLY แทนได้
-- ------------------------------------------------------------
create index if not exists idx_sub_tenant_form_time on public.submissions(tenant_id, form_id, submitted_at desc);
