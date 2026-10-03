-- ============================================================
-- KROK · 0057_security_hardening
-- ปิดช่องโหว่จากการตรวจความปลอดภัย (ต.ค. 2026)
--  1) 2FA ครอบ RPC ทั้งหมด (PostgREST pre-request) + ด่านซ้ำใน RPC อันตราย
--  2) ห้ามลบฟอร์มถาวรผ่าน REST (ใบที่ส่งแล้วจะไม่หายตาม)
--  3) ใบที่ส่ง: ผู้ใช้ insert ตรงไม่ได้แล้ว (ส่งผ่าน server /api/submit) + trigger บังคับค่าที่ server ต้องกำหนด
--  4) ไฟล์ใน storage: อ่านได้ตามสิทธิ์เห็นฟอร์ม/ใบที่ส่ง · ห้ามเขียนไฟล์ลงใบที่ส่งไปแล้ว
--  5) โควตาแพ็กเกจบังคับใน DB: ฟอร์มเผยแพร่ / สมาชิก / API รับข้อมูล / ขั้นอนุมัติ / workflow / พื้นที่ไฟล์
--  6) ห้ามอนุมัติใบของตัวเอง (ยกเว้น workspace ที่มีผู้จัดการคนเดียว)
--  7) audit log: เขียนได้จาก server เท่านั้น
--  8) คำเชิญ: เข้าร่วมอัตโนมัติเฉพาะคนที่สมัครผ่านลิงก์เชิญ
--  9) ฟังก์ชันที่เปิดข้อมูลข้าม tenant ได้ → ตรวจสมาชิกก่อน
-- รันซ้ำได้ · ต้องรันหลัง 0056
-- ============================================================

-- ---------- helper ----------
create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ============================================================
-- 1) 2FA ครอบทุก RPC
-- RLS แบบ restrictive (0055) ใช้ไม่ได้กับฟังก์ชัน security definer → ตรวจที่ PostgREST ก่อนเรียกทุก RPC
-- ยกเว้นฟังก์ชันที่ต้องใช้ตอนยังไม่ได้กรอกรหัส 2FA
-- ============================================================
create or replace function public.krok_pre_request()
returns void
language plpgsql stable security invoker
set search_path = public
as $$
declare p text; fn text;
begin
  if current_user <> 'authenticated' then return; end if;
  p := coalesce(current_setting('request.path', true), '');
  if position('/rpc/' in p) = 0 then return; end if;
  fn := lower(split_part(substring(p from position('/rpc/' in p) + 5), '/', 1));
  if fn in ('session_bundle', 'mfa_ok') then return; end if;
  if not public.mfa_ok() then
    raise exception 'ต้องยืนยันรหัส 2FA ก่อน' using errcode = '42501', hint = 'mfa required';
  end if;
end $$;
grant execute on function public.krok_pre_request() to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request to ''public.krok_pre_request''';
    perform pg_notify('pgrst', 'reload config');
  else
    raise notice 'ไม่มี role authenticator (ไม่ใช่ Supabase) — ข้ามการตั้ง pre-request';
  end if;
end $$;

-- ด่านซ้ำในฟังก์ชันที่ทำลายข้อมูลได้ (เผื่อ pre-request ถูกปิด)
create or replace function public.delete_workspace(p_tenant uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare my_count int;
begin
  if not public.mfa_ok() then raise exception 'ต้องยืนยันรหัส 2FA ก่อน' using errcode = '42501'; end if;
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
  delete from public.tenants where id = p_tenant;
end $$;
revoke all on function public.delete_workspace(uuid) from public, anon;
grant execute on function public.delete_workspace(uuid) to authenticated;
revoke execute on function public.rename_workspace(uuid, text) from anon;

-- ============================================================
-- 2) ฟอร์ม: แก้/สร้างได้ (ผู้จัดการ/ผู้ออกแบบ) แต่ลบถาวรไม่ได้ — แอปใช้ถังขยะ (deleted_at)
-- ============================================================
drop policy if exists forms_write on public.forms;
drop policy if exists forms_insert on public.forms;
create policy forms_insert on public.forms for insert with check (public.can_manage(tenant_id));
drop policy if exists forms_update on public.forms;
create policy forms_update on public.forms for update using (public.can_manage(tenant_id)) with check (public.can_manage(tenant_id));
revoke delete on public.forms from anon, authenticated;

-- ใบที่ส่งแล้วไม่ถูกลบตามฟอร์ม (ลบ workspace ยังลบทั้งหมดได้ตามเดิม — ลบพร้อมกันในคำสั่งเดียว)
alter table public.submissions drop constraint if exists submissions_form_id_fkey;
alter table public.submissions add constraint submissions_form_id_fkey
  foreign key (form_id) references public.forms(id) on delete no action;

-- ============================================================
-- 3) ใบที่ส่ง
-- ============================================================
-- ผู้ใช้ insert ตรงไม่ได้ — ส่งผ่าน /api/submit (ตรวจเครื่อง คำนวณผลใหม่ แล้วบันทึกด้วย service role)
revoke insert on public.submissions, public.submission_photos, public.submission_doc_extracts from anon, authenticated;

-- ด่านซ้ำ (เผื่อสิทธิ์ถูกคืนในอนาคต): ค่าที่ผู้ใช้ห้ามกำหนดเอง
create or replace function public.zz_guard_submission_insert()
returns trigger
language plpgsql
as $$
declare f record; nm text;
begin
  -- เวลาส่ง = เวลาของ server เสมอ (กันย้อนวันที่ / หลบโควตารายเดือน)
  new.submitted_at := now();
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  select tenant_id, title, icon, requires_approval, approval_chain, status, deleted_at into f
    from public.forms where id = new.form_id;
  if not found or f.tenant_id <> new.tenant_id then
    raise exception 'ไม่พบฟอร์ม';
  end if;
  if f.deleted_at is not null or f.status::text <> 'published' then
    raise exception 'ฟอร์มนี้ยังไม่เปิดให้กรอก';
  end if;
  if not (new.form_id in (select public.my_visible_form_ids())) then
    raise exception 'ไม่มีสิทธิ์กรอกฟอร์มนี้';
  end if;
  select coalesce(nullif(m.name, ''), m.email, '') into nm
    from public.memberships m where m.tenant_id = new.tenant_id and m.user_id = auth.uid();
  new.user_name := coalesce(nm, new.user_name);
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

-- มีใบนี้อยู่แล้วไหม (มองข้าม RLS — ใช้ใน policy ของ storage)
create or replace function public.submission_exists(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_id is not null and exists (select 1 from public.submissions where id = p_id)
$$;
revoke all on function public.submission_exists(uuid) from public, anon;
grant execute on function public.submission_exists(uuid) to authenticated;

-- ============================================================
-- 4) Storage
-- ============================================================
do $$
declare own text;
begin
  if to_regclass('storage.objects') is null then return; end if;

  -- submissions: path = <tenant>/<submission_id>/<ไฟล์>
  -- เจ้าของไฟล์: Supabase รุ่นใหม่ใช้ owner_id (text) · รุ่นเก่า owner (uuid)
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner_id') then
    own := 'coalesce(owner_id, owner::text) = auth.uid()::text';
  else
    own := 'owner = auth.uid()';
  end if;
  execute 'drop policy if exists "krok read own tenant files" on storage.objects';
  execute format($p$create policy "krok read own tenant files" on storage.objects for select using (
    bucket_id = 'submissions'
    and public.try_uuid((storage.foldername(name))[1]) in (select public.my_tenant_ids())
    and (
      -- ใบที่ส่งแล้ว: เห็นไฟล์เมื่อเห็นใบนั้น (RLS ของ submissions = สิทธิ์เห็นฟอร์ม/ทีม/ของตัวเอง)
      exists (select 1 from public.submissions s where s.id = public.try_uuid((storage.foldername(name))[2]))
      -- ยังไม่ส่ง: เฉพาะไฟล์ที่ตัวเองอัปโหลด
      or (not public.submission_exists(public.try_uuid((storage.foldername(name))[2])) and %s)
    ))$p$, own);
  execute 'drop policy if exists "krok upload own tenant files" on storage.objects';
  execute $p$create policy "krok upload own tenant files" on storage.objects for insert with check (
    bucket_id = 'submissions'
    and public.try_uuid((storage.foldername(name))[1]) in (select public.my_tenant_ids())
    and public.try_uuid((storage.foldername(name))[2]) is not null
    -- ใบที่ส่งไปแล้วเพิ่มไฟล์ไม่ได้ (กันแทรกรูปลงใบของคนอื่น)
    and not public.submission_exists(public.try_uuid((storage.foldername(name))[2]))
  )$p$;

  -- attachments: path = <tenant>/<form_id>/<ไฟล์> · อ่านได้เมื่อเห็นฟอร์มนั้น
  execute 'drop policy if exists "krok read tenant attachments" on storage.objects';
  execute $p$create policy "krok read tenant attachments" on storage.objects for select using (
    bucket_id = 'attachments'
    and public.try_uuid((storage.foldername(name))[1]) in (select public.my_tenant_ids())
    and (
      public.try_uuid((storage.foldername(name))[1]) in (select public.my_managed_tenant_ids())
      or public.try_uuid((storage.foldername(name))[2]) in (select public.my_visible_form_ids())
    ))$p$;
  -- cast ที่ล้มเหลวทำให้คำขอ error ทั้งก้อน → ใช้ try_uuid
  execute 'drop policy if exists "krok write tenant attachments" on storage.objects';
  execute $p$create policy "krok write tenant attachments" on storage.objects for insert with check (
    bucket_id = 'attachments' and public.can_manage(public.try_uuid((storage.foldername(name))[1])))$p$;
  execute 'drop policy if exists "krok update tenant attachments" on storage.objects';
  execute $p$create policy "krok update tenant attachments" on storage.objects for update using (
    bucket_id = 'attachments' and public.can_manage(public.try_uuid((storage.foldername(name))[1])))$p$;
  execute 'drop policy if exists "krok delete tenant attachments" on storage.objects';
  execute $p$create policy "krok delete tenant attachments" on storage.objects for delete using (
    bucket_id = 'attachments' and public.can_manage(public.try_uuid((storage.foldername(name))[1])))$p$;
end $$;

do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  -- ชนิดไฟล์เอกสารแนบ (ตรงกับ ATTACH_ACCEPT ในแอป)
  update storage.buckets set allowed_mime_types = array['application/pdf', 'image/*', 'video/mp4', 'text/plain']
   where id = 'attachments';
  -- รูปในใบที่ส่ง / แบบร่าง / งาน = รูปภาพเท่านั้น
  update storage.buckets set allowed_mime_types = array['image/*'] where id in ('submissions', 'drafts', 'cases');
exception when undefined_column then
  raise notice 'storage.buckets ไม่มีคอลัมน์ allowed_mime_types — ข้าม';
end $$;

-- เอกสารแนบแบบลิงก์: http(s) เท่านั้น (แถวเดิมไม่ถูกตรวจย้อนหลัง)
alter table public.form_attachments drop constraint if exists form_attachments_url_http;
alter table public.form_attachments add constraint form_attachments_url_http
  check (kind <> 'link' or url ~* '^https?://') not valid;

-- ============================================================
-- 5) โควตาแพ็กเกจใน DB
-- ============================================================
-- เจ้าของบัญชี / แพ็กเกจ / กลุ่ม workspace — ฉบับภายใน (ไม่ตรวจสมาชิก, ไม่เปิดให้ผู้ใช้เรียก)
create or replace function public._billing_owner(p_tenant uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.created_by from public.tenants t
      where t.id = p_tenant and t.created_by is not null
        and exists (select 1 from public.memberships m where m.tenant_id = t.id and m.user_id = t.created_by and m.role = 'owner')),
    (select m.user_id from public.memberships m where m.tenant_id = p_tenant and m.role = 'owner' order by m.created_at limit 1),
    (select t.created_by from public.tenants t where t.id = p_tenant)
  );
$$;
create or replace function public._plan_key(p_tenant uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when a.expires_at is not null and a.expires_at + public.plan_grace() < now() then 'free' else a.plan end
       from public.account_plans a where a.user_id = public._billing_owner(p_tenant)),
    'free');
$$;
create or replace function public._tenant_limit(p_tenant uuid, p_name text)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare k text; e jsonb;
begin
  k := public._plan_key(p_tenant);
  select x into e
    from public.platform_plan_settings s, jsonb_array_elements(coalesce(s.plans->'catalog', '[]'::jsonb)) x
   where s.id and x->>'key' in (k, 'free')
   order by (x->>'key' = k) desc
   limit 1;
  if e is null then return null; end if;
  return case jsonb_typeof(e->p_name)
    when 'boolean' then case when (e->>p_name)::boolean then 1 else 0 end
    when 'number'  then floor((e->>p_name)::numeric)::bigint
    else null end;
end $$;
create or replace function public._pool_ids(p_tenant uuid)
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare o uuid; ids uuid[];
begin
  o := public._billing_owner(p_tenant);
  if o is null then return array[p_tenant]; end if;
  ids := public.owner_tenant_ids(o);
  if not (p_tenant = any(coalesce(ids, '{}'))) then ids := coalesce(ids, '{}') || p_tenant; end if;
  return ids;
end $$;
revoke all on function public._billing_owner(uuid), public._plan_key(uuid), public._tenant_limit(uuid, text), public._pool_ids(uuid) from public, anon, authenticated;

-- ฟังก์ชันเดิมที่ผู้ใช้เรียกได้: ตอบเฉพาะ workspace ของตัวเอง
create or replace function public.tenant_billing_owner(p_tenant uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null or p_tenant in (select public.my_tenant_ids())
              then public._billing_owner(p_tenant) end
$$;
create or replace function public.tenant_plan_key(p_tenant uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null or p_tenant in (select public.my_tenant_ids())
              then public._plan_key(p_tenant) else 'free' end
$$;

-- 5.1 ฟอร์มเผยแพร่: ตรวจตอนเปลี่ยนจากฉบับร่างเป็นเผยแพร่ด้วย (เดิมตรวจแค่ตอนสร้าง/กู้คืน)
create or replace function public.zz_quota_forms()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim bigint; used bigint;
begin
  if auth.uid() is null then return new; end if;
  if new.deleted_at is not null or new.status is distinct from 'published' then return new; end if;
  -- นับไปแล้ว (เผยแพร่อยู่และไม่ได้ถูกลบ) → ไม่ต้องตรวจซ้ำ
  if tg_op = 'UPDATE' and old.deleted_at is null and old.status = 'published' then return new; end if;
  lim := public._tenant_limit(new.tenant_id, 'maxForms');
  if lim is not null and lim < 999999 then
    select count(*) into used from public.forms
     where tenant_id = any(public._pool_ids(new.tenant_id)) and deleted_at is null and id <> new.id;
    if used >= lim then
      perform public._quota_fail('forms', format('สร้างฟอร์มได้สูงสุด %s แบบ (รวมทุก workspace ของบัญชี)', lim));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists zz_quota_forms on public.forms;
create trigger zz_quota_forms before insert or update of deleted_at, status on public.forms
  for each row execute function public.zz_quota_forms();

-- 5.2 ขั้นอนุมัติ + workflow + ผู้อนุมัติต้องเป็นสมาชิก (กันส่งแจ้งเตือนไปคนนอก)
create or replace function public._chain_steps(c jsonb)
returns int language sql immutable as $$
  select count(*)::int from jsonb_array_elements(case when jsonb_typeof(c) = 'array' then c else '[]'::jsonb end) e
   where jsonb_typeof(e) = 'object' and coalesce(e->>'user_id', '') <> ''
$$;
create or replace function public._is_workflow(s jsonb)
returns boolean language sql immutable as $$
  select exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(s->'steps') = 'array' then s->'steps' else '[]'::jsonb end) with ordinality t(e, i)
     where t.i > 1 and (coalesce(t.e->'assignee'->>'team_id', '') <> '' or coalesce(t.e->'assignee'->>'user_id', '') <> ''))
$$;
create or replace function public.zz_guard_forms_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim bigint; n int; prev int := 0; bad text;
begin
  if auth.uid() is null then return new; end if;
  -- ผู้อนุมัติที่เพิ่มใหม่ต้องเป็นสมาชิก workspace นี้
  select e->>'user_id' into bad
    from jsonb_array_elements(case when jsonb_typeof(new.approval_chain) = 'array' then new.approval_chain else '[]'::jsonb end) e
   where coalesce(e->>'user_id', '') <> ''
     and not exists (select 1 from public.memberships m where m.tenant_id = new.tenant_id and m.user_id::text = e->>'user_id')
     and (tg_op = 'INSERT' or not coalesce(old.approval_chain, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('user_id', e->>'user_id')))
   limit 1;
  if bad is not null then raise exception 'ผู้อนุมัติต้องเป็นสมาชิกของ workspace นี้'; end if;

  n := public._chain_steps(new.approval_chain);
  if tg_op = 'UPDATE' then prev := public._chain_steps(old.approval_chain); end if;
  if n > prev then
    lim := public._tenant_limit(new.tenant_id, 'maxApprovalSteps');
    if lim is not null and lim < 999999 and n > lim then
      perform public._quota_fail('approval_steps', format('ตั้งขั้นอนุมัติได้สูงสุด %s ขั้น', lim));
    end if;
  end if;

  if public._is_workflow(new.schema) and (tg_op = 'INSERT' or not public._is_workflow(old.schema)) then
    if coalesce(public._tenant_limit(new.tenant_id, 'workflow'), 1) = 0 then
      perform public._quota_fail('workflow', 'แพ็กเกจนี้ยังใช้ฟอร์มกรอกหลายคน (ส่งต่องานระหว่างทีม) ไม่ได้');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists zz_guard_forms_plan on public.forms;
create trigger zz_guard_forms_plan before insert or update of approval_chain, schema on public.forms
  for each row execute function public.zz_guard_forms_plan();

-- 5.3 สมาชิก: นับคนไม่ซ้ำทุก workspace ของบัญชี + คำเชิญค้าง (เหมือน canAddMember ในแอป)
create or replace function public.zz_quota_invites()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim bigint; pool uuid[]; used bigint; e text := lower(trim(new.email));
begin
  if auth.uid() is null then return new; end if;
  lim := public._tenant_limit(new.tenant_id, 'maxMembers');
  if lim is null or lim >= 999999 then return new; end if;
  pool := public._pool_ids(new.tenant_id);
  -- เป็นสมาชิก/ถูกเชิญค้างอยู่แล้ว = ไม่เพิ่มยอด
  if exists (select 1 from public.memberships m where m.tenant_id = any(pool) and lower(coalesce(m.email, '')) = e)
     or exists (select 1 from public.invites i where i.tenant_id = any(pool) and i.accepted_at is null and lower(i.email) = e and i.id <> new.id) then
    return new;
  end if;
  select (select count(distinct m.user_id) from public.memberships m where m.tenant_id = any(pool))
       + (select count(distinct lower(i.email)) from public.invites i
           where i.tenant_id = any(pool) and i.accepted_at is null and i.id <> new.id
             and not exists (select 1 from public.memberships m where m.tenant_id = any(pool) and lower(coalesce(m.email, '')) = lower(i.email)))
    into used;
  if used >= lim then
    perform public._quota_fail('members', format('มีผู้ใช้ได้สูงสุด %s คน (รวมทุก workspace ของบัญชี)', lim));
  end if;
  return new;
end $$;
drop trigger if exists zz_quota_invites on public.invites;
create trigger zz_quota_invites before insert on public.invites
  for each row execute function public.zz_quota_invites();

-- 5.4 API รับข้อมูล (form_intake): เปิดใช้ได้ตามแพ็กเกจ
create or replace function public.zz_quota_intake()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim bigint; used bigint;
begin
  if auth.uid() is null or not coalesce(new.enabled, false) then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.enabled, false) then return new; end if;
  lim := public._tenant_limit(new.tenant_id, 'maxIntakeForms');
  if lim is null or lim >= 999999 then return new; end if;
  if lim <= 0 then perform public._quota_fail('intake', 'แพ็กเกจนี้ยังใช้ API รับข้อมูลไม่ได้'); end if;
  select count(distinct form_id) into used from public.form_intake
   where tenant_id = any(public._pool_ids(new.tenant_id)) and enabled and form_id <> new.form_id;
  if used >= lim then
    perform public._quota_fail('intake', format('เปิด API รับข้อมูลได้สูงสุด %s ฟอร์ม', lim));
  end if;
  return new;
end $$;
drop trigger if exists zz_quota_intake on public.form_intake;
create trigger zz_quota_intake before insert or update of enabled on public.form_intake
  for each row execute function public.zz_quota_intake();

-- 5.5 พื้นที่ไฟล์: นับทุก bucket ของ workspace (เดิมนับแค่ submissions/attachments)
create or replace function public.tenant_storage_bytes(p_tenant uuid, p_fresh boolean default false)
returns bigint language plpgsql security definer set search_path = public, storage as $fn$
declare b bigint; v_at timestamptz; win interval;
begin
  if auth.uid() is not null and not (p_tenant in (select public.my_tenant_ids())) then return null; end if;
  select bytes, computed_at into b, v_at from public.tenant_storage_usage where tenant_id = p_tenant;
  -- p_fresh จากผู้ใช้: คำนวณใหม่ได้ไม่ถี่กว่า 30 วินาที (กันยิงสแกน storage ทั้งก้อนซ้ำ ๆ)
  win := case when p_fresh and auth.uid() is null then interval '0 seconds'
              when p_fresh then interval '30 seconds'
              else interval '10 minutes' end;
  if b is not null and v_at > now() - win then
    return b;
  end if;
  if to_regclass('storage.objects') is null then return 0; end if;
  execute 'select coalesce(sum(coalesce((metadata->>''size'')::bigint, 0)), 0) from storage.objects
            where bucket_id in (''submissions'', ''attachments'', ''drafts'', ''cases'', ''branding'') and name like $1'
    into b using p_tenant::text || '/%';
  insert into public.tenant_storage_usage (tenant_id, bytes, computed_at) values (p_tenant, b, now())
    on conflict (tenant_id) do update set bytes = excluded.bytes, computed_at = excluded.computed_at;
  return b;
end $fn$;

create or replace function public.storage_quota_ok(p_bucket text, p_name text)
returns boolean language plpgsql security definer set search_path = public as $$
declare t uuid; lim bigint;
begin
  if p_bucket not in ('submissions', 'attachments', 'drafts', 'cases') then return true; end if;
  t := public.try_uuid(split_part(p_name, '/', 1));
  if t is null then return true; end if;
  lim := public._tenant_limit(t, 'storageMb');
  if lim is null or lim >= 999999 then return true; end if;
  return public.pool_storage_bytes(t) < lim * 1048576;
end $$;

-- ============================================================
-- 6) อนุมัติ: ห้ามอนุมัติใบของตัวเอง (ยกเว้นเป็นผู้จัดการคนเดียวของ workspace) + 2FA
-- ============================================================
create or replace function public.review_submission(p_id uuid, p_decision text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.submissions;
  chain jsonb;
  n int;
  step int;
  cur jsonb;
  assigned boolean;
  nm text;
  note text := left(coalesce(p_note, ''), 500);
  new_status text;
  new_step int;
  advanced boolean := false;
begin
  if uid is null then raise exception 'unauthorized'; end if;
  if not public.mfa_ok() then raise exception 'ต้องยืนยันรหัส 2FA ก่อน' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'การตัดสินไม่ถูกต้อง'; end if;

  select * into s from public.submissions where id = p_id for update;
  if not found or s.tenant_id not in (select public.my_tenant_ids()) then raise exception 'ไม่พบรายการ'; end if;
  if not public.can_manage(s.tenant_id) then raise exception 'ไม่มีสิทธิ์อนุมัติ'; end if;
  if s.approval_status::text <> 'pending' then raise exception 'รายการนี้ถูกดำเนินการไปแล้ว'; end if;
  if s.submitted_by = uid and exists (
    select 1 from public.memberships m
     where m.tenant_id = s.tenant_id and m.user_id <> uid and m.role in ('owner', 'admin', 'designer')
  ) then
    raise exception 'อนุมัติเอกสารที่ตัวเองส่งไม่ได้ — ให้ผู้จัดการคนอื่นอนุมัติ';
  end if;

  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into chain
  from (
    select e, ord from jsonb_array_elements(coalesce(s.approval_chain, '[]'::jsonb)) with ordinality as t(e, ord)
    where jsonb_typeof(e) = 'object' and coalesce(e->>'user_id', '') <> ''
    order by ord limit 6
  ) x;
  n := jsonb_array_length(chain);
  step := coalesce(s.approval_step, 0);
  cur := chain->step;

  assigned := case when cur is not null then cur->>'user_id' = uid::text else true end;
  if not assigned and public.my_role(s.tenant_id)::text is distinct from 'owner' then
    raise exception 'ยังไม่ถึงคิวคุณอนุมัติขั้นนี้';
  end if;

  if p_decision = 'rejected' then
    new_status := 'rejected'; new_step := step;
  elsif n > 0 and step < n - 1 then
    new_status := 'pending'; new_step := step + 1; advanced := true;
  else
    new_status := 'approved'; new_step := step;
  end if;

  nm := public.case_member_name(s.tenant_id, uid);
  update public.submissions set
    approval_status = new_status::approval_status,
    approval_step = new_step,
    approval_history = coalesce(approval_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'step', step,
      'label', coalesce(nullif(cur->>'label', ''), 'ขั้น ' || (step + 1)),
      'reviewer_name', nm,
      'decision', p_decision,
      'note', note,
      'at', now())),
    reviewed_by = uid,
    reviewer_name = nm,
    reviewed_at = now(),
    review_note = note
  where id = s.id;

  return jsonb_build_object('status', new_status, 'step', new_step, 'advanced', advanced,
                            'form_id', s.form_id, 'form_title', s.form_title, 'tenant_id', s.tenant_id);
end $$;
revoke all on function public.review_submission(uuid, text, text) from public, anon;
grant execute on function public.review_submission(uuid, text, text) to authenticated;

-- ============================================================
-- 7) audit log: server เขียนด้วย service role เท่านั้น · เวลา = เวลาของ server
-- ============================================================
revoke insert, update, delete on public.audit_log from anon, authenticated;
create or replace function public.zz_guard_audit_insert()
returns trigger language plpgsql as $$
begin
  new.created_at := now();
  return new;
end $$;
drop trigger if exists zz_guard_audit_insert on public.audit_log;
create trigger zz_guard_audit_insert before insert on public.audit_log
  for each row execute function public.zz_guard_audit_insert();

-- ============================================================
-- 8) คำเชิญ: เข้าร่วมอัตโนมัติเฉพาะคนที่สมัครผ่านลิงก์เชิญ (via_invite)
-- สมัครเองตามปกติ → ได้ workspace ของตัวเอง และเห็นคำเชิญค้างให้กดรับ/ปฏิเสธในแอป
-- ============================================================
create or replace function public._provision_user(p_user uuid, p_email text, p_meta jsonb, p_confirmed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  inv record;
  disp text;
  org_name text;
  new_tenant uuid;
  joined int := 0;
  via_invite boolean := coalesce(p_meta->>'via_invite', '') in ('true', '1');
  all_menus jsonb := '["studio","forms","approvals","dashboard","team","billing","integrations","ai"]'::jsonb;
begin
  disp := coalesce(nullif(p_meta->>'display_name',''), split_part(p_email,'@',1));

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

-- ============================================================
-- 9) ฟังก์ชันที่เปิดให้ anon เรียกได้โดยไม่จำเป็น
-- ============================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       -- ไม่รวมฟังก์ชันที่ policy ของตารางเรียกใช้ (anon ต้องเรียกได้ ไม่งั้นคำขอ anon error แทนที่จะได้ผลว่าง)
       and p.proname in ('ai_usage_all', 'ai_usage_get', 'ai_usage_get_by', 'create_workspace', 'set_plan', 'session_bundle')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- ============================================================
-- 10) เครดิต AI: ตรวจยอด + นับเพิ่มในคำสั่งเดียว (กันยิงพร้อมกันหลายครั้งแล้วใช้เกินโควตา)
-- คืนยอดใหม่ · -1 = เต็มแล้ว (ไม่นับเพิ่ม) · เรียกได้เฉพาะ service role
-- ============================================================
create or replace function public.ai_credit_take(p_tenant uuid, p_period text, p_purpose text, p_max int)
returns int language plpgsql security definer set search_path = public as $$
declare pool uuid[]; used int;
begin
  if p_purpose not in ('form_gen','form_from_image','photo_check','doc_extract') then
    raise exception 'purpose ไม่ถูกต้อง: %', p_purpose;
  end if;
  pool := public._pool_ids(p_tenant);
  -- ล็อกตามกลุ่ม workspace + เดือน + ชนิดงาน จนจบ transaction
  perform pg_advisory_xact_lock(hashtext(coalesce(public._billing_owner(p_tenant)::text, p_tenant::text) || ':' || p_period || ':' || p_purpose));
  select coalesce(sum(calls), 0)::int into used from public.tenant_ai_usage
   where tenant_id = any(pool) and period = p_period and purpose = p_purpose;
  if used >= p_max then return -1; end if;
  perform public.ai_usage_incr_by(p_tenant, p_period, p_purpose);
  return used + 1;
end $$;
revoke all on function public.ai_credit_take(uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.ai_credit_take(uuid, text, text, int) to service_role;

-- ============================================================
-- 11) policy ของ branding/drafts: cast ด้วย try_uuid (path แปลก ๆ ไม่ทำให้คำขอ error ทั้งก้อน)
-- ============================================================
do $$
begin
  if to_regclass('storage.objects') is null then return; end if;
  execute 'drop policy if exists "krok branding write" on storage.objects';
  execute $p$create policy "krok branding write" on storage.objects for insert to authenticated
    with check (bucket_id = 'branding' and public.try_uuid((storage.foldername(name))[1]) in (select public.my_managed_tenant_ids()))$p$;
  execute 'drop policy if exists "krok branding update" on storage.objects';
  execute $p$create policy "krok branding update" on storage.objects for update to authenticated
    using (bucket_id = 'branding' and public.try_uuid((storage.foldername(name))[1]) in (select public.my_managed_tenant_ids()))$p$;
  execute 'drop policy if exists "krok branding delete" on storage.objects';
  execute $p$create policy "krok branding delete" on storage.objects for delete to authenticated
    using (bucket_id = 'branding' and public.try_uuid((storage.foldername(name))[1]) in (select public.my_managed_tenant_ids()))$p$;
  execute 'drop policy if exists "krok branding read own" on storage.objects';
  execute $p$create policy "krok branding read own" on storage.objects for select to authenticated
    using (bucket_id = 'branding' and public.try_uuid((storage.foldername(name))[1]) in (select public.my_tenant_ids()))$p$;
  execute 'drop policy if exists "krok drafts own insert" on storage.objects';
  execute $p$create policy "krok drafts own insert" on storage.objects for insert
    with check (bucket_id = 'drafts' and public.try_uuid((storage.foldername(name))[1]) in (select public.my_tenant_ids())
                and (storage.foldername(name))[2] = auth.uid()::text)$p$;
  execute 'drop policy if exists "krok drafts own select" on storage.objects';
  execute $p$create policy "krok drafts own select" on storage.objects for select
    using (bucket_id = 'drafts' and public.try_uuid((storage.foldername(name))[1]) in (select public.my_tenant_ids())
           and (storage.foldername(name))[2] = auth.uid()::text)$p$;
end $$;
