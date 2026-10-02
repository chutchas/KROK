-- ============================================================
-- KROK · 0047_subscriptions
-- ต่ออายุอัตโนมัติ (recurring) ด้วยบัตร — KROK นับรอบเอง, Gateway เก็บ token บัตร + ตัดเงินตามคำสั่ง
-- - ซื้อครั้งแรกด้วยบัตร + ลูกค้ายินยอม → เก็บ token (payment_method_ref) + ล็อกราคาไว้ (renew_price)
-- - cron รายวันตัดเงินล่วงหน้า 1 วันก่อนหมดอายุ · ไม่ผ่าน = ลองใหม่วันละครั้ง สูงสุด 4 ครั้ง (ครอบช่วงผ่อนผัน 3 วัน)
-- - ยกเลิก = ปิด auto_renew → ใช้ได้ถึงสิ้นรอบแล้วลดเป็น Free เอง
-- - QR / โอน: ไม่มี token → ต่ออายุเองเหมือนเดิม
-- รันซ้ำได้ · ต้องรัน 0046 ก่อน
-- ============================================================

alter table public.account_plans add column if not exists auto_renew           boolean not null default false;
alter table public.account_plans add column if not exists payment_method_ref   text;     -- token ของบัตรที่ Gateway เก็บ (ไม่ใช่เลขบัตร)
alter table public.account_plans add column if not exists payment_method_label text;     -- เช่น "Visa •••• 4242" (แสดงผล)
alter table public.account_plans add column if not exists renew_price          int;      -- ราคาที่ล็อกไว้ตอนสมัคร (บาท)
alter table public.account_plans add column if not exists renew_months         int not null default 1;
alter table public.account_plans add column if not exists renew_attempts       int not null default 0;
alter table public.account_plans add column if not exists next_attempt_at      timestamptz;
alter table public.account_plans add column if not exists last_renew_error     text;
alter table public.account_plans add column if not exists expiry_reminded_at   timestamptz; -- เตือนก่อนหมดอายุ (คนที่ไม่ได้ต่ออัตโนมัติ) ล่าสุดเมื่อไร
create index if not exists idx_account_plans_renew on public.account_plans(expires_at) where auto_renew;

-- ใบแจ้งหนี้: ซื้อผ่านหน้าชำระ (checkout) หรือ ตัดเงินอัตโนมัติ (renewal) + ความยินยอมต่ออายุอัตโนมัติ
alter table public.invoices add column if not exists kind       text not null default 'checkout';
alter table public.invoices add column if not exists auto_renew boolean not null default false;
do $$ begin
  alter table public.invoices add constraint invoices_kind_check check (kind in ('checkout', 'renewal'));
exception when duplicate_object then null; end $$;

-- คำขอเปลี่ยนบัตร (ไม่มียอดเงิน — Gateway เก็บบัตรใหม่แล้วแจ้งกลับ)
create table if not exists public.card_setups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  gateway_ref text unique,
  status      text not null default 'pending' check (status in ('pending', 'saved', 'failed')),
  created_at  timestamptz not null default now()
);
alter table public.card_setups enable row level security;
revoke all on public.card_setups from anon, authenticated;

-- จ่ายสำเร็จ: ล้างตัวนับการลองใหม่ (ทั้ง checkout และ renewal)
create or replace function public.zz_invoice_paid_reset()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' and new.user_id is not null then
    update public.account_plans set renew_attempts = 0, next_attempt_at = null, last_renew_error = null
     where user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists zz_invoice_paid_reset on public.invoices;
create trigger zz_invoice_paid_reset after update of status on public.invoices
  for each row execute function public.zz_invoice_paid_reset();

-- ตัดเงินรอบต่ออายุไม่ผ่าน → นับครั้ง + เลื่อนไปลองพรุ่งนี้ (service role)
create or replace function public.renewal_failed(p_invoice uuid, p_reason text)
returns int
language plpgsql security definer set search_path = public as $$
declare iv public.invoices; n int;
begin
  select * into iv from public.invoices where id = p_invoice for update;
  if not found or iv.kind <> 'renewal' then return null; end if;
  if iv.status = 'paid' then return null; end if;
  update public.invoices set status = 'failed', note = left(coalesce(p_reason, ''), 200) where id = iv.id and status <> 'failed';
  update public.account_plans
     set renew_attempts = renew_attempts + 1,
         next_attempt_at = now() + interval '1 day',
         last_renew_error = left(coalesce(p_reason, 'ตัดเงินไม่สำเร็จ'), 200)
   where user_id = iv.user_id
  returning renew_attempts into n;
  return n;
end $$;
revoke all on function public.renewal_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.renewal_failed(uuid, text) to service_role;

-- บัญชีที่ถึงรอบตัดเงิน: ต่ออายุอัตโนมัติ + มีบัตร + เหลือไม่ถึง 1 วัน (หรือหมดแล้วแต่ยังในช่วงผ่อนผัน)
-- + ลองไม่เกิน 4 ครั้ง + ถึงเวลาลองรอบถัดไป + ไม่มีรายการตัดเงินค้างอยู่
create or replace function public.due_renewals(p_limit int default 100)
returns setof public.account_plans
language sql stable security definer set search_path = public as $$
  select a.* from public.account_plans a
   where a.auto_renew and a.payment_method_ref is not null and a.plan <> 'free'
     and a.expires_at is not null
     and a.expires_at <= now() + interval '1 day'
     and a.expires_at + public.plan_grace() > now()
     and a.renew_attempts < 4
     and (a.next_attempt_at is null or a.next_attempt_at <= now())
     and not exists (
       select 1 from public.invoices i
        where i.user_id = a.user_id and i.kind = 'renewal' and i.status = 'pending'
          and i.issued_at > now() - interval '6 hours')
   order by a.expires_at
   limit p_limit;
$$;
revoke all on function public.due_renewals(int) from public, anon, authenticated;
grant execute on function public.due_renewals(int) to service_role;

-- หมดอายุจริง (เลยช่วงผ่อนผัน) = ปิดต่ออายุอัตโนมัติด้วย
create or replace function public.expire_account_plans()
returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in select user_id, plan from public.account_plans
            where expires_at is not null and expires_at + public.plan_grace() < now() and plan <> 'free'
            for update loop
    update public.account_plans
       set plan = 'free', expires_at = null, auto_renew = false, renew_attempts = 0, next_attempt_at = null, updated_at = now()
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

-- เลือกแพ็กเกจฟรีเอง = เลิกต่ออายุอัตโนมัติด้วย
create or replace function public.zz_account_plan_free_stop_renew()
returns trigger language plpgsql as $$
begin
  if new.plan = 'free' then new.auto_renew := false; new.renew_attempts := 0; new.next_attempt_at := null; end if;
  return new;
end $$;
drop trigger if exists zz_account_plan_free_stop_renew on public.account_plans;
create trigger zz_account_plan_free_stop_renew before insert or update of plan on public.account_plans
  for each row execute function public.zz_account_plan_free_stop_renew();

-- จ่ายรอบต่ออายุช้า (ยังอยู่ในช่วงผ่อนผัน) = นับต่อจากวันหมดอายุเดิม (รอบบิลไม่เลื่อน)
create or replace function public.apply_invoice_paid(p_invoice uuid, p_amount_satang bigint, p_paid_at timestamptz default now())
returns text
language plpgsql security definer set search_path = public as $$
declare iv public.invoices; cur public.account_plans; base timestamptz; newexp timestamptz;
begin
  select * into iv from public.invoices where id = p_invoice for update;
  if not found then return 'error: invoice not found'; end if;
  if iv.status = 'paid' then return 'duplicate'; end if;
  if iv.status not in ('pending', 'failed') then return 'error: invoice status ' || iv.status; end if;
  if iv.user_id is null then return 'error: invoice has no account'; end if;
  if p_amount_satang is distinct from (iv.amount::bigint * 100) then
    return format('error: amount mismatch (got %s, expected %s)', p_amount_satang, iv.amount::bigint * 100);
  end if;

  select * into cur from public.account_plans where user_id = iv.user_id for update;
  if found and cur.plan = iv.plan and cur.expires_at is not null and cur.expires_at + public.plan_grace() > now() then
    base := cur.expires_at;
  else
    base := now();
  end if;
  newexp := base + make_interval(months => greatest(iv.months, 1));

  insert into public.account_plans (user_id, plan, expires_at, updated_at)
    values (iv.user_id, iv.plan, newexp, now())
  on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at, updated_at = now();

  update public.invoices set status = 'paid', paid_at = coalesce(p_paid_at, now()) where id = iv.id;
  update public.tenants set plan = iv.plan where id = any(public.owner_tenant_ids(iv.user_id));
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, meta)
    values (iv.tenant_id, iv.user_id, 'plan.paid', 'invoice', iv.id,
            jsonb_build_object('plan', iv.plan, 'amount', iv.amount, 'expires_at', newexp, 'number', iv.number));
  return 'ok';
end $$;
