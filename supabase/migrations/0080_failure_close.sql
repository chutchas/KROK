-- ============================================================
-- KROK · 0080_failure_close
-- ปิดเรื่องใบไม่ผ่าน: ผู้จัดการ (owner/admin/designer) บันทึกว่าแก้ไขแล้ว พร้อมหมายเหตุการแก้ไข
-- แถบ "ต้องดูตอนนี้" บนแดชบอร์ดนับใบไม่ผ่านที่ยังไม่ปิด (ย้อนหลัง 30 วัน) แทนนับเฉพาะวันนี้
-- เปิดเรื่องกลับได้ (owner/admin) เผื่อปิดผิด · ทุกครั้งบันทึกใน audit_log
-- คอลัมน์ปิดเรื่องแก้ผ่าน REST ไม่ได้ — ผ่าน RPC เท่านั้น (เพิ่มในตัวกัน zz_guard_submission_update)
-- รันซ้ำได้ · ต้องรันหลัง 0079
-- ============================================================

alter table public.submissions
  add column if not exists fail_closed_at      timestamptz,
  add column if not exists fail_closed_by      uuid references auth.users(id) on delete set null,
  add column if not exists fail_closed_by_name text,
  add column if not exists fail_close_note     text;

-- ใบไม่ผ่านที่ยังเปิดอยู่ (แดชบอร์ด)
create index if not exists idx_submissions_open_fail on public.submissions(tenant_id, submitted_at desc)
  where result = 'fail' and fail_closed_at is null and deleted_at is null;

-- ---------- ตัวกันแก้ไข: เพิ่มคอลัมน์ปิดเรื่อง ----------
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
    or new.geo              is distinct from old.geo
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
    or new.deleted_at       is distinct from old.deleted_at
    or new.deleted_by       is distinct from old.deleted_by
    or new.deleted_by_name  is distinct from old.deleted_by_name
    or new.delete_reason    is distinct from old.delete_reason
    or new.fail_closed_at      is distinct from old.fail_closed_at
    or new.fail_closed_by      is distinct from old.fail_closed_by
    or new.fail_closed_by_name is distinct from old.fail_closed_by_name
    or new.fail_close_note     is distinct from old.fail_close_note
  ) then
    raise exception 'แก้ไขข้อมูลของเอกสารที่ส่งแล้วไม่ได้ (การอนุมัติต้องทำผ่านหน้าอนุมัติ)';
  end if;
  return new;
end $$;

-- ---------- ปิดเรื่อง ----------
create or replace function public.close_submission_failure(p_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare s record; uid uuid := auth.uid(); nm text; n text := btrim(coalesce(p_note, ''));
begin
  if uid is null then raise exception 'unauthorized'; end if;
  if not public.mfa_ok() then raise exception 'mfa required'; end if;
  select * into s from public.submissions where id = p_id for update;
  if not found or s.tenant_id not in (select public.my_tenant_ids()) or s.deleted_at is not null then
    raise exception 'ไม่พบเอกสาร';
  end if;
  if not public.can_manage(s.tenant_id) then raise exception 'เฉพาะผู้จัดการ workspace ที่ปิดเรื่องได้'; end if;
  if s.result is distinct from 'fail' then raise exception 'เอกสารนี้ไม่มีข้อที่ไม่ผ่าน'; end if;
  if s.fail_closed_at is not null then raise exception 'ปิดเรื่องไปแล้ว'; end if;
  if char_length(n) < 3 then raise exception 'กรุณาระบุว่าแก้ไขอย่างไร'; end if;
  select coalesce(nullif(m.name, ''), nullif(m.email, ''), '') into nm
    from public.memberships m where m.user_id = uid and m.tenant_id = s.tenant_id;
  update public.submissions
     set fail_closed_at = now(), fail_closed_by = uid, fail_closed_by_name = nm, fail_close_note = left(n, 1000)
   where id = s.id;
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, meta)
  values (s.tenant_id, uid, 'submission.fail_close', 'submission', s.id,
          jsonb_build_object('doc_no', s.doc_no, 'form_title', s.form_title, 'note', left(n, 1000)));
end $$;
revoke all on function public.close_submission_failure(uuid, text) from public, anon;
grant execute on function public.close_submission_failure(uuid, text) to authenticated;

-- ---------- เปิดเรื่องกลับ (ปิดผิด) ----------
create or replace function public.reopen_submission_failure(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare s record; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthorized'; end if;
  if not public.mfa_ok() then raise exception 'mfa required'; end if;
  select * into s from public.submissions where id = p_id for update;
  if not found or s.tenant_id not in (select public.my_tenant_ids()) or s.deleted_at is not null then
    raise exception 'ไม่พบเอกสาร';
  end if;
  if public.my_role(s.tenant_id)::text not in ('owner', 'admin') then
    raise exception 'เฉพาะเจ้าของหรือผู้ดูแล workspace ที่เปิดเรื่องกลับได้';
  end if;
  if s.fail_closed_at is null then raise exception 'เรื่องนี้ยังไม่ได้ปิด'; end if;
  update public.submissions
     set fail_closed_at = null, fail_closed_by = null, fail_closed_by_name = null, fail_close_note = null
   where id = s.id;
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, meta)
  values (s.tenant_id, uid, 'submission.fail_reopen', 'submission', s.id,
          jsonb_build_object('doc_no', s.doc_no, 'form_title', s.form_title, 'note', s.fail_close_note));
end $$;
revoke all on function public.reopen_submission_failure(uuid) from public, anon;
grant execute on function public.reopen_submission_failure(uuid) to authenticated;
