-- ============================================================
-- KROK · 0054_form_visibility_rls
-- สิทธิ์เห็นฟอร์ม "เฉพาะทีม / เฉพาะคน" บังคับที่ฐานข้อมูล (เดิมซ่อนแค่ในหน้าแอป — เรียก REST ตรงยังอ่านได้)
--
-- ใครเห็นฟอร์ม: ผู้จัดการ workspace (owner/admin/designer) เห็นทุกฟอร์ม
--               สมาชิกทั่วไป เห็นฟอร์มที่แชร์ทั้ง workspace/สาธารณะ, ฟอร์มที่แชร์ให้ทีมของตัวเอง/ตัวเอง
--               และฟอร์มที่ตัวเองมีงาน (ฟอร์มกรอกหลายคน) อยู่ — ทีมขั้นถัดไปต้องเปิดฟอร์มได้
-- ตามไปด้วย: เอกสารที่ส่งแล้ว (+ รูป / หลักฐานอ่านเอกสาร) และเอกสารแนบของฟอร์ม
--            เอกสารที่ตัวเองส่งเห็นได้เสมอ
-- ไฟล์ใน storage ยังคุมระดับ workspace (path มี id สุ่มของเอกสาร เดาไม่ได้) — ลิงก์รูปออกผ่านหน้าที่ตรวจสิทธิ์แล้ว
-- รันซ้ำได้ · ต้องรันหลัง 0053
-- ============================================================

-- workspace ที่ผู้ใช้เป็นผู้จัดการ (เรียกครั้งเดียวต่อ query — ไม่เรียก can_manage ทีละแถว)
create or replace function public.my_managed_tenant_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from public.memberships
   where user_id = auth.uid() and role in ('owner', 'admin', 'designer')
$$;

-- ฟอร์มที่ผู้ใช้มีสิทธิ์เห็น
create or replace function public.my_visible_form_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  with mt as (select public.my_managed_tenant_ids() as id),
       tm as (select public.my_team_ids()::text as id)
  select f.id
    from public.forms f
   where f.tenant_id in (select public.my_tenant_ids())
     and (
       f.tenant_id in (select id from mt)
       or coalesce(f.visibility, 'all') in ('all', 'public')
       or (f.visibility = 'teams' and exists (
             select 1 from jsonb_array_elements_text(case when jsonb_typeof(f.visible_teams) = 'array' then f.visible_teams else '[]'::jsonb end) t(v)
              where t.v in (select id from tm)))
       or (f.visibility = 'users' and jsonb_typeof(f.visible_users) = 'array' and f.visible_users ? auth.uid()::text)
       or exists (
             select 1 from public.form_cases c
              where c.form_id = f.id
                and (auth.uid() = any(c.participants) or c.claimed_by = auth.uid()
                     or c.assignee_team::text in (select id from tm)))
     )
$$;
revoke all on function public.my_managed_tenant_ids() from public, anon;
revoke all on function public.my_visible_form_ids() from public, anon;
grant execute on function public.my_managed_tenant_ids() to authenticated, service_role;
grant execute on function public.my_visible_form_ids() to authenticated, service_role;

-- ---- forms ----
drop policy if exists forms_select on public.forms;
create policy forms_select on public.forms
  for select using (id in (select public.my_visible_form_ids()));

-- ---- submissions ----
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions
  for select using (
    tenant_id in (select public.my_tenant_ids())
    and (
      tenant_id in (select public.my_managed_tenant_ids())
      or submitted_by = auth.uid()
      or form_id in (select public.my_visible_form_ids())
    )
  );

-- ---- รูป / หลักฐานอ่านเอกสาร: เห็นเมื่อเห็นเอกสารนั้น ----
drop policy if exists photos_select on public.submission_photos;
create policy photos_select on public.submission_photos
  for select using (
    tenant_id in (select public.my_tenant_ids())
    and exists (select 1 from public.submissions s where s.id = submission_id)
  );

drop policy if exists doc_extract_select on public.submission_doc_extracts;
create policy doc_extract_select on public.submission_doc_extracts
  for select using (
    tenant_id in (select public.my_tenant_ids())
    and exists (select 1 from public.submissions s where s.id = submission_id)
  );

-- ---- เอกสารแนบของฟอร์ม ----
drop policy if exists attach_select on public.form_attachments;
create policy attach_select on public.form_attachments
  for select using (
    tenant_id in (select public.my_tenant_ids())
    and (tenant_id in (select public.my_managed_tenant_ids()) or form_id in (select public.my_visible_form_ids()))
  );
