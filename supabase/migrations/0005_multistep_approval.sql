-- ============================================================
-- KROK · 0005_multistep_approval  (Phase 3)
-- อนุมัติหลายขั้น กำหนดผู้อนุมัติเฉพาะรายต่อขั้น
--
-- approval_chain = jsonb array เรียงตามลำดับขั้น:
--   [{ "user_id": "...", "name": "หัวหน้ากะ A", "label": "หัวหน้ากะ" }, ...]
-- submission เก็บ snapshot ของ chain ตอนส่ง เพื่อไม่ให้การแก้ฟอร์มกระทบงานที่ค้างอยู่
-- ============================================================

-- ---------- forms: เก็บ chain ที่ตั้งไว้ ----------
alter table public.forms
  add column if not exists approval_chain jsonb not null default '[]'::jsonb;

-- ให้ requires_approval สอดคล้องกับ chain (เผื่อฟอร์มเก่าที่ตั้ง requires_approval ไว้)
-- ฟอร์มที่ requires_approval=true แต่ไม่มี chain จะถือเป็น 1 ขั้น (ผู้จัดการคนใดก็ได้) ใน logic ฝั่งแอป

-- ---------- submissions: สถานะหลายขั้น ----------
alter table public.submissions
  add column if not exists approval_chain   jsonb not null default '[]'::jsonb,
  add column if not exists approval_step     int   not null default 0,
  add column if not exists approval_history  jsonb not null default '[]'::jsonb;

-- ============================================================
-- helper: หา user_id ผู้อนุมัติของขั้นปัจจุบันใน submission
-- ============================================================
create or replace function public.current_approver(sub public.submissions)
returns uuid
language sql immutable as $$
  select nullif(sub.approval_chain -> sub.approval_step ->> 'user_id','')::uuid
$$;

-- ============================================================
-- ปรับ trigger แจ้งเตือนตอน submit:
--   - pending + มี chain → แจ้ง "ผู้อนุมัติขั้นแรก" (เฉพาะราย)
--   - pending + ไม่มี chain (requires_approval แบบเดิม) → แจ้งผู้จัดการทุกคน
--   - result=fail (ไม่เข้า flow อนุมัติ) → แจ้งผู้จัดการ
-- ============================================================
create or replace function public.notify_on_submission()
returns trigger
language plpgsql security definer set search_path = public as $$
declare m record; first_approver uuid;
begin
  if new.approval_status = 'pending' then
    first_approver := public.current_approver(new);
    if first_approver is not null then
      insert into public.notifications (tenant_id, user_id, type, title, body, link, submission_id)
      values (new.tenant_id, first_approver, 'approval_request',
              'รออนุมัติ: ' || new.form_title,
              coalesce(new.user_name,'') || ' ส่งเข้ามารออนุมัติ (ขั้นที่ 1)',
              '/approvals', new.id);
    else
      -- ไม่ได้ระบุผู้อนุมัติเฉพาะราย → แจ้งผู้จัดการทุกคน
      for m in
        select user_id from public.memberships
        where tenant_id = new.tenant_id and role in ('owner','admin','designer')
          and user_id <> coalesce(new.submitted_by,'00000000-0000-0000-0000-000000000000')
      loop
        insert into public.notifications (tenant_id, user_id, type, title, body, link, submission_id)
        values (new.tenant_id, m.user_id, 'approval_request',
                'รออนุมัติ: ' || new.form_title,
                coalesce(new.user_name,'') || ' ส่งเข้ามารออนุมัติ',
                '/approvals', new.id);
      end loop;
    end if;
  elsif new.result = 'fail' then
    for m in
      select user_id from public.memberships
      where tenant_id = new.tenant_id and role in ('owner','admin','designer')
        and user_id <> coalesce(new.submitted_by,'00000000-0000-0000-0000-000000000000')
    loop
      insert into public.notifications (tenant_id, user_id, type, title, body, link, submission_id)
      values (new.tenant_id, m.user_id, 'fail_alert',
              'พบปัญหา: ' || new.form_title,
              coalesce(new.user_name,'') || ' พบปัญหา ' || coalesce(jsonb_array_length(new.fails),0) || ' รายการ',
              '/submission/' || new.id, new.id);
    end loop;
  end if;
  return new;
end $$;

-- ============================================================
-- ปรับ trigger ตอนสถานะเปลี่ยน:
--   - อนุมัติจบ/ตีกลับ → แจ้งผู้ส่ง
--   - ยัง pending แต่ approval_step เพิ่ม (เลื่อนขั้น) → แจ้งผู้อนุมัติขั้นถัดไป
-- ============================================================
create or replace function public.notify_on_review()
returns trigger
language plpgsql security definer set search_path = public as $$
declare next_approver uuid;
begin
  -- เลื่อนขั้น: ยัง pending แต่ step เปลี่ยน
  if new.approval_status = 'pending' and new.approval_step is distinct from old.approval_step then
    next_approver := public.current_approver(new);
    if next_approver is not null then
      insert into public.notifications (tenant_id, user_id, type, title, body, link, submission_id)
      values (new.tenant_id, next_approver, 'approval_request',
              'รออนุมัติ: ' || new.form_title,
              'ถึงคิวคุณอนุมัติ (ขั้นที่ ' || (new.approval_step + 1) || ')',
              '/approvals', new.id);
    end if;
  end if;

  -- จบ flow
  if new.approval_status is distinct from old.approval_status
     and new.approval_status in ('approved','rejected')
     and new.submitted_by is not null then
    insert into public.notifications (tenant_id, user_id, type, title, body, link, submission_id)
    values (new.tenant_id, new.submitted_by,
            new.approval_status,
            (case when new.approval_status='approved' then 'อนุมัติแล้ว: ' else 'ตีกลับ: ' end) || new.form_title,
            coalesce(new.reviewer_name,'ผู้ตรวจ') ||
              (case when new.approval_status='approved' then ' อนุมัติงานของคุณ (ครบทุกขั้น)'
                    else ' ตีกลับงานของคุณ' end) ||
              (case when new.review_note is not null and new.review_note <> ''
                    then ' — ' || new.review_note else '' end),
            '/submission/' || new.id, new.id);
  end if;
  return new;
end $$;
