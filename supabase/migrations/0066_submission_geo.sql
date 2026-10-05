-- ============================================================
-- KROK · 0066_submission_geo
-- พิกัด GPS ของใบที่ส่ง (ฟอร์มที่เปิด "เก็บพิกัด" ใน Studio)
--   geo = { lat, lng, acc (เมตร), at (ms) } · ไม่เปิด/หาไม่ได้ = null
--   ตั้งค่าต่อฟอร์มเก็บใน schema (geo: optional|required, watermark) → ไม่ต้องมีคอลัมน์ที่ forms
-- ใบที่ส่งแล้วแก้พิกัดผ่าน REST ไม่ได้ (เพิ่มใน guard)
-- รันซ้ำได้ · ต้องรันหลัง 0065
-- ============================================================

alter table public.submissions add column if not exists geo jsonb;

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
  ) then
    raise exception 'แก้ไขข้อมูลของเอกสารที่ส่งแล้วไม่ได้ (การอนุมัติต้องทำผ่านหน้าอนุมัติ)';
  end if;
  return new;
end $$;
