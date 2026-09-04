-- ============================================================
-- KROK · 0004_workflow_invites_notifications  (Phase 2)
-- - เชิญสมาชิก (invites) + signup ที่รู้จัก invite
-- - workflow อนุมัติ (forms.requires_approval + submissions.approval_*)
-- - ศูนย์แจ้งเตือน (notifications) + triggers
-- ============================================================

-- ---------- enum: สถานะอนุมัติ ----------
do $$ begin
  create type approval_status as enum ('none','pending','approved','rejected');
exception when duplicate_object then null; end $$;

-- ============================================================
-- memberships: เก็บ email/ชื่อ ไว้แสดงในหน้า Team
-- (RLS อ่าน auth.users จาก client ไม่ได้ จึง denormalize ไว้ที่นี่)
-- ============================================================
alter table public.memberships
  add column if not exists email text,
  add column if not exists name  text;

-- ============================================================
-- forms: ต้องผ่านการอนุมัติไหม
-- ============================================================
alter table public.forms
  add column if not exists requires_approval boolean not null default false;

-- ============================================================
-- submissions: ฟิลด์อนุมัติ
-- ============================================================
alter table public.submissions
  add column if not exists approval_status approval_status not null default 'none',
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewer_name text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

create index if not exists idx_sub_pending
  on public.submissions(tenant_id, submitted_at desc)
  where approval_status = 'pending';

-- ให้ approver (manager) อัปเดตสถานะอนุมัติได้
drop policy if exists submissions_review on public.submissions;
create policy submissions_review on public.submissions
  for update using (public.can_manage(tenant_id))
  with check (public.can_manage(tenant_id));

-- ============================================================
-- invites — เชิญคนเข้า tenant ด้วยอีเมล
-- ============================================================
create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  email       text not null,
  role        membership_role not null default 'operator',
  invited_by  uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (tenant_id, email)
);
create index if not exists idx_invites_email on public.invites(lower(email)) where accepted_at is null;

alter table public.invites enable row level security;

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select using (tenant_id in (select public.my_tenant_ids()));

drop policy if exists invites_manage on public.invites;
create policy invites_manage on public.invites
  for all using (public.my_role(tenant_id) in ('owner','admin'))
  with check (public.my_role(tenant_id) in ('owner','admin'));

-- ============================================================
-- signup ที่รู้จัก invite:
-- ถ้ามี invite ค้างสำหรับอีเมลนี้ → เข้าร่วม tenant ที่ถูกเชิญ (ไม่สร้าง tenant ใหม่)
-- ถ้าไม่มี → สร้าง tenant ส่วนตัวเป็น owner (เหมือนเดิม)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_tenant uuid;
  org_name   text;
  disp       text;
  inv        record;
  joined     int := 0;
begin
  disp := coalesce(nullif(new.raw_user_meta_data->>'display_name',''),
                   split_part(new.email,'@',1));

  for inv in
    select * from public.invites
    where lower(email) = lower(new.email) and accepted_at is null
  loop
    insert into public.memberships (tenant_id, user_id, role, email, name)
      values (inv.tenant_id, new.id, inv.role, new.email, disp)
      on conflict (tenant_id, user_id) do nothing;
    update public.invites set accepted_at = now() where id = inv.id;
    joined := joined + 1;
  end loop;

  if joined = 0 then
    org_name := coalesce(nullif(new.raw_user_meta_data->>'org_name',''),
                         split_part(new.email,'@',1) || ' Workspace');
    insert into public.tenants (name, created_by) values (org_name, new.id)
      returning id into new_tenant;
    insert into public.memberships (tenant_id, user_id, role, email, name)
      values (new_tenant, new.id, 'owner', new.email, disp);
  end if;
  return new;
end $$;

-- ============================================================
-- notifications — ศูนย์แจ้งเตือนต่อผู้ใช้
-- ============================================================
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,          -- approval_request, fail_alert, approved, rejected
  title       text not null,
  body        text not null default '',
  link        text,
  submission_id uuid references public.submissions(id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications(user_id, created_at desc);
create index if not exists idx_notif_unread on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;

-- อ่าน/อัปเดต (mark read) ได้เฉพาะของตัวเอง
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- trigger: หลัง submit → สร้าง notification ให้ approver/manager
--   - ถ้า pending อนุมัติ → แจ้งขออนุมัติ
--   - ถ้า result = fail → แจ้งเตือนพบปัญหา
-- ============================================================
create or replace function public.notify_on_submission()
returns trigger
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if new.approval_status = 'pending' then
    for m in
      select user_id from public.memberships
      where tenant_id = new.tenant_id and role in ('owner','admin','designer')
        and user_id <> new.submitted_by
    loop
      insert into public.notifications (tenant_id, user_id, type, title, body, link, submission_id)
      values (new.tenant_id, m.user_id, 'approval_request',
              'รออนุมัติ: ' || new.form_title,
              coalesce(new.user_name,'') || ' ส่งเข้ามารออนุมัติ',
              '/approvals', new.id);
    end loop;
  elsif new.result = 'fail' then
    for m in
      select user_id from public.memberships
      where tenant_id = new.tenant_id and role in ('owner','admin','designer')
        and user_id <> new.submitted_by
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

drop trigger if exists trg_notify_submission on public.submissions;
create trigger trg_notify_submission after insert on public.submissions
for each row execute function public.notify_on_submission();

-- ============================================================
-- trigger: เมื่อสถานะอนุมัติเปลี่ยน → แจ้งผู้ส่ง
-- ============================================================
create or replace function public.notify_on_review()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.approval_status is distinct from old.approval_status
     and new.approval_status in ('approved','rejected')
     and new.submitted_by is not null then
    insert into public.notifications (tenant_id, user_id, type, title, body, link, submission_id)
    values (new.tenant_id, new.submitted_by,
            new.approval_status,
            (case when new.approval_status='approved' then 'อนุมัติแล้ว: ' else 'ตีกลับ: ' end) || new.form_title,
            coalesce(new.reviewer_name,'ผู้ตรวจ') ||
              (case when new.approval_status='approved' then ' อนุมัติงานของคุณ'
                    else ' ตีกลับงานของคุณ' end) ||
              (case when new.review_note is not null and new.review_note <> ''
                    then ' — ' || new.review_note else '' end),
            '/submission/' || new.id, new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_review on public.submissions;
create trigger trg_notify_review after update on public.submissions
for each row execute function public.notify_on_review();

-- realtime สำหรับ bell
alter publication supabase_realtime add table public.notifications;
