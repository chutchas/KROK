-- ============================================================
-- KROK · 0036_review_rpc
-- การอนุมัติเอกสารทำผ่าน RPC review_submission เท่านั้น
--
-- เดิม: server action ตรวจว่า "ถึงคิวผู้อนุมัติคนนี้ไหม" แล้ว update ตาราง submissions ตรง ๆ
--   → ผู้จัดการ (designer/admin) ยิง REST update ช่องอนุมัติเองได้ ข้ามผู้อนุมัติที่กำหนด
-- ใหม่: กติกาเดียวกันย้ายมาอยู่ในฐานข้อมูล + ห้าม REST แก้ช่องอนุมัติตรง ๆ
--   - ผู้อนุมัติของขั้นปัจจุบัน หรือ owner (override) หรือ chain ว่าง = ผู้จัดการคนไหนก็ได้
--   - อนุมัติขั้นที่ยังไม่ใช่ขั้นสุดท้าย = เลื่อนขั้น (ยัง pending)
-- ต้องรันหลัง 0035
-- ============================================================

create or replace function public.review_submission(p_id uuid, p_decision text, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
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
  if p_decision not in ('approved', 'rejected') then raise exception 'การตัดสินไม่ถูกต้อง'; end if;

  select * into s from public.submissions where id = p_id for update;
  if not found or s.tenant_id not in (select public.my_tenant_ids()) then raise exception 'ไม่พบรายการ'; end if;
  if not public.can_manage(s.tenant_id) then raise exception 'ไม่มีสิทธิ์อนุมัติ'; end if;
  if s.approval_status::text <> 'pending' then raise exception 'รายการนี้ถูกดำเนินการไปแล้ว'; end if;

  -- เหมือน sanitizeChain ฝั่งแอป: เฉพาะขั้นที่มี user_id ไม่เกิน 6 ขั้น
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

-- ห้าม REST แก้ช่องอนุมัติตรง ๆ (ต้องผ่าน review_submission ซึ่งเป็น security definer)
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
