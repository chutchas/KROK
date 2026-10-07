-- ============================================================
-- KROK · 0070_scheduled_downgrade
-- ลดแพ็กเกจระหว่างรอบที่จ่ายแล้ว = ใช้แพ็กเกจเดิมต่อจนหมดรอบ แล้วค่อยเปลี่ยน
--   account_plans.pending_plan / pending_at — แพ็กเกจที่จะเปลี่ยนไปเมื่อหมดรอบ (expires_at)
--   request_plan_change(): ลูกค้าเลือกแพ็กเกจราคา 0
--       ยังอยู่ในรอบแพ็กเกจเสียเงิน → ตั้งเวลาเปลี่ยน (ปิดต่ออายุอัตโนมัติ) · คืน 'scheduled'
--       ไม่มีรอบค้าง → เปลี่ยนทันที (เหมือน set_plan เดิม) · คืน 'now'
--   cancel_plan_change(): ยกเลิกการตั้งเวลา (แพ็กเกจเดิมหมดอายุตามรอบเดิม — เปิดต่ออายุเองได้)
--   _plan_key(): ถึงเวลา (expires_at ผ่านแล้ว) + มี pending_plan = ใช้แพ็กเกจใหม่ทันที (ไม่รอช่วงผ่อนผัน/cron)
--   expire_account_plans(): cron เขียนค่าลงตารางให้ตรงกัน
--   ต่ออายุ/จ่ายเงิน/เปลี่ยนแพ็กเกจ = ล้างการตั้งเวลาอัตโนมัติ (trigger)
-- รันซ้ำได้ · ต้องรันหลัง 0069
-- ============================================================

alter table public.account_plans add column if not exists pending_plan text check (pending_plan is null or char_length(pending_plan) <= 30);
alter table public.account_plans add column if not exists pending_at timestamptz;

-- แพ็กเกจที่ใช้จริง: ถึงรอบเปลี่ยนแล้ว → แพ็กเกจที่ตั้งไว้ · หมดอายุเกินผ่อนผัน → free
create or replace function public._plan_key(p_tenant uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case
              when a.pending_plan is not null and a.expires_at is not null and a.expires_at <= now() then a.pending_plan
              when a.expires_at is not null and a.expires_at + public.plan_grace() < now() then 'free'
              else a.plan end
       from public.account_plans a where a.user_id = public._billing_owner(p_tenant)),
    'free');
$$;

-- แพ็กเกจราคา 0 ที่ลูกค้าเลือกเองได้
create or replace function public._free_plan_ok(p_plan text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_plan = 'free' or exists (
    select 1 from public.platform_plan_settings s, jsonb_array_elements(coalesce(s.plans->'catalog', '[]'::jsonb)) x
     where s.id and x->>'key' = p_plan and coalesce((x->>'visible')::boolean, true)
       and coalesce((x->>'priceThb')::numeric, 0) <= 0);
$$;
revoke all on function public._free_plan_ok(text) from public, anon, authenticated;

create or replace function public.request_plan_change(p_tenant uuid, p_plan text)
returns text
language plpgsql security definer set search_path = public as $$
declare cur public.account_plans;
begin
  if auth.uid() is null or public.tenant_billing_owner(p_tenant) is distinct from auth.uid() then
    raise exception 'เฉพาะเจ้าของบัญชีที่สร้าง workspace นี้เปลี่ยนแพ็กเกจได้';
  end if;
  if not public._free_plan_ok(p_plan) then raise exception 'แพ็กเกจนี้ต้องชำระเงินก่อน'; end if;

  select * into cur from public.account_plans where user_id = auth.uid() for update;
  if found and cur.plan <> p_plan and cur.expires_at is not null and cur.expires_at > now() then
    update public.account_plans
       set pending_plan = p_plan, pending_at = now(), auto_renew = false, next_attempt_at = null, updated_at = now(), updated_by = auth.uid()
     where user_id = auth.uid();
    return 'scheduled';
  end if;

  insert into public.account_plans (user_id, plan, expires_at, updated_at, updated_by) values (auth.uid(), p_plan, null, now(), auth.uid())
    on conflict (user_id) do update set plan = excluded.plan, expires_at = null, pending_plan = null, pending_at = null, updated_at = now(), updated_by = auth.uid();
  update public.tenants set plan = p_plan where id = any(public.owner_tenant_ids(auth.uid()));
  return 'now';
end $$;
revoke all on function public.request_plan_change(uuid, text) from public, anon;
grant execute on function public.request_plan_change(uuid, text) to authenticated;

create or replace function public.cancel_plan_change(p_tenant uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.tenant_billing_owner(p_tenant) is distinct from auth.uid() then
    raise exception 'เฉพาะเจ้าของบัญชีที่สร้าง workspace นี้เปลี่ยนแพ็กเกจได้';
  end if;
  update public.account_plans set pending_plan = null, pending_at = null, updated_at = now(), updated_by = auth.uid()
   where user_id = auth.uid() and (expires_at is null or expires_at > now());
end $$;
revoke all on function public.cancel_plan_change(uuid) from public, anon;
grant execute on function public.cancel_plan_change(uuid) to authenticated;

-- จ่ายเงิน/ต่ออายุ (วันหมดอายุเลื่อนออกไป) หรือเปลี่ยนแพ็กเกจ = ล้างการตั้งเวลา
create or replace function public.zz_account_plan_clear_pending()
returns trigger language plpgsql as $$
begin
  if new.pending_plan is not null and tg_op = 'UPDATE' and new.pending_plan is not distinct from old.pending_plan
     and (new.plan is distinct from old.plan
          or (new.expires_at is not null and old.expires_at is not null and new.expires_at > old.expires_at)) then
    new.pending_plan := null;
    new.pending_at := null;
  end if;
  return new;
end $$;
drop trigger if exists zz_account_plan_clear_pending on public.account_plans;
create trigger zz_account_plan_clear_pending before update on public.account_plans
  for each row execute function public.zz_account_plan_clear_pending();

-- cron รายวัน: ถึงรอบเปลี่ยน → เขียนแพ็กเกจใหม่ลงตาราง · หมดอายุเกินผ่อนผัน → free (เหมือน 0047)
create or replace function public.expire_account_plans()
returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in select user_id, plan, pending_plan from public.account_plans
            where pending_plan is not null and expires_at is not null and expires_at <= now()
            for update loop
    update public.account_plans
       set plan = r.pending_plan, expires_at = null, pending_plan = null, pending_at = null,
           auto_renew = false, renew_attempts = 0, next_attempt_at = null, updated_at = now()
     where user_id = r.user_id;
    update public.tenants set plan = r.pending_plan where id = any(public.owner_tenant_ids(r.user_id));
    insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, meta)
      select t, null, 'plan.downgraded', 'tenant', t, jsonb_build_object('from', r.plan, 'to', r.pending_plan)
        from unnest(public.owner_tenant_ids(r.user_id)) t;
    n := n + 1;
  end loop;

  for r in select user_id, plan from public.account_plans
            where expires_at is not null and expires_at + public.plan_grace() < now() and plan <> 'free'
            for update loop
    update public.account_plans
       set plan = 'free', expires_at = null, pending_plan = null, pending_at = null,
           auto_renew = false, renew_attempts = 0, next_attempt_at = null, updated_at = now()
     where user_id = r.user_id;
    update public.tenants set plan = 'free' where id = any(public.owner_tenant_ids(r.user_id));
    insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, meta)
      select t, null, 'plan.expired', 'tenant', t, jsonb_build_object('from', r.plan)
        from unnest(public.owner_tenant_ids(r.user_id)) t;
    n := n + 1;
  end loop;
  update public.invoices set status = 'void'
   where status = 'pending' and checkout_expires_at is not null and checkout_expires_at < now() - interval '1 day';
  update public.invoices set status = 'void'
   where status = 'pending' and kind = 'renewal' and issued_at < now() - interval '2 days';
  return n;
end $$;
revoke all on function public.expire_account_plans() from public, anon, authenticated;
grant execute on function public.expire_account_plans() to service_role;
