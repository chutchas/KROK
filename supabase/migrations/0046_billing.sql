-- ============================================================
-- KROK · 0046_billing
-- เตรียมรับชำระเงินจริงผ่าน Payment Gateway กลางของบริษัท
-- (สัญญา API อยู่ในเอกสาร claude/billing-gateway-contract.md)
--
-- 1) account_plans.expires_at — แพ็กเกจเสียเงินมีวันหมดอายุ (null = ไม่หมดอายุ เช่น Free / แอดมินให้)
--    หมดอายุเกินช่วงผ่อนผัน 3 วัน = ใช้สิทธิ์ Free ทันที (tenant_plan_key ตรวจเอง ไม่ต้องรอ cron)
-- 2) invoices: ผูกกับบัญชีผู้ใช้ + เลขอ้างอิงของ Gateway + ลิงก์ชำระ · ผู้ใช้ insert ตรงไม่ได้แล้ว (กันปลอมใบเสร็จ)
-- 3) payment_events — ผลที่ Gateway ส่งกลับ (กันประมวลผลซ้ำด้วย event_id)
-- 4) apply_invoice_paid() — ยืนยันการชำระ → อัปเกรด/ต่ออายุแพ็กเกจ แบบ atomic (ล็อกแถวใบแจ้งหนี้)
-- 5) expire_account_plans() — เก็บกวาดแพ็กเกจที่หมดอายุ (เรียกจาก cron)
-- รันซ้ำได้ · ต้องรัน 0045 ก่อน
-- ============================================================

alter table public.account_plans add column if not exists expires_at timestamptz;

alter table public.invoices add column if not exists user_id      uuid references auth.users(id) on delete set null;
alter table public.invoices add column if not exists months       int not null default 1;
alter table public.invoices add column if not exists gateway_ref  text;
alter table public.invoices add column if not exists checkout_url text;
alter table public.invoices add column if not exists checkout_expires_at timestamptz;
create unique index if not exists uq_invoices_gateway_ref on public.invoices(gateway_ref) where gateway_ref is not null;
create index if not exists idx_invoices_user on public.invoices(user_id, issued_at desc);

-- ผู้ใช้สร้างใบแจ้งหนี้เองไม่ได้ (server ออกให้ด้วย service role เท่านั้น)
drop policy if exists invoices_insert on public.invoices;
revoke insert, update, delete on public.invoices from anon, authenticated;

create table if not exists public.payment_events (
  id          bigint generated always as identity primary key,
  event_id    text not null unique,          -- id ของเหตุการณ์จาก Gateway (กันซ้ำ)
  type        text not null,                 -- payment.succeeded | payment.failed | payment.expired | ...
  invoice_id  uuid references public.invoices(id) on delete set null,
  gateway_ref text,
  amount      bigint,                        -- สตางค์
  payload     jsonb not null default '{}'::jsonb,
  result      text,                          -- ok | duplicate | ignored | error: ...
  received_at timestamptz not null default now()
);
create index if not exists idx_payment_events_invoice on public.payment_events(invoice_id);
alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;

-- ช่วงผ่อนผันหลังหมดอายุ
create or replace function public.plan_grace() returns interval language sql immutable as $$ select interval '3 days' $$;

-- แพ็กเกจที่ workspace ใช้: หมดอายุเกินช่วงผ่อนผัน = free
create or replace function public.tenant_plan_key(p_tenant uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when a.expires_at is not null and a.expires_at + public.plan_grace() < now() then 'free' else a.plan end
       from public.account_plans a where a.user_id = public.tenant_billing_owner(p_tenant)),
    'free');
$$;

-- ยืนยันการชำระของใบแจ้งหนี้ (service role เท่านั้น)
--   แพ็กเกจเดิมที่ยังไม่หมดอายุ → ต่ออายุจากวันหมดอายุเดิม · เปลี่ยนแพ็กเกจ/หมดอายุแล้ว → เริ่มนับจากวันนี้
--   ยอดเงินต้องตรงกับใบแจ้งหนี้ (สตางค์) · ชำระซ้ำ = duplicate ไม่ต่ออายุซ้ำ
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
  if found and cur.plan = iv.plan and cur.expires_at is not null and cur.expires_at > now() then
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
revoke all on function public.apply_invoice_paid(uuid, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_invoice_paid(uuid, bigint, timestamptz) to service_role;

-- เก็บกวาด: แพ็กเกจที่หมดอายุเกินช่วงผ่อนผัน → free (คืนจำนวนบัญชีที่ถูกลด)
create or replace function public.expire_account_plans()
returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in select user_id, plan from public.account_plans
            where expires_at is not null and expires_at + public.plan_grace() < now() and plan <> 'free'
            for update loop
    update public.account_plans set plan = 'free', expires_at = null, updated_at = now() where user_id = r.user_id;
    update public.tenants set plan = 'free' where id = any(public.owner_tenant_ids(r.user_id));
    insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, meta)
      select t, null, 'plan.expired', 'tenant', t, jsonb_build_object('from', r.plan)
        from unnest(public.owner_tenant_ids(r.user_id)) t;
    n := n + 1;
  end loop;
  -- ลิงก์ชำระที่หมดอายุแล้ว → void
  update public.invoices set status = 'void'
   where status = 'pending' and checkout_expires_at is not null and checkout_expires_at < now() - interval '1 day';
  return n;
end $$;
revoke all on function public.expire_account_plans() from public, anon, authenticated;
grant execute on function public.expire_account_plans() to service_role;

-- set_plan (ลูกค้าเรียกเอง): เลือกได้เฉพาะแพ็กเกจราคา 0 — แพ็กเกจเสียเงินต้องผ่านการชำระ (apply_invoice_paid)
-- หรือแอดมินกำหนดให้ · กันเรียก RPC ตรงเพื่อข้ามการจ่ายเงิน · เลือกแพ็กเกจฟรี = ยกเลิกวันหมดอายุไปด้วย
create or replace function public.set_plan(p_tenant uuid, p_plan text)
returns void
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if auth.uid() is null or public.tenant_billing_owner(p_tenant) is distinct from auth.uid() then
    raise exception 'เฉพาะเจ้าของบัญชีที่สร้าง workspace นี้เปลี่ยนแพ็กเกจได้';
  end if;
  select exists (
    select 1 from public.platform_plan_settings s, jsonb_array_elements(coalesce(s.plans->'catalog', '[]'::jsonb)) x
     where s.id and x->>'key' = p_plan and (coalesce((x->>'visible')::boolean, true) or p_plan = 'free')
       and coalesce((x->>'priceThb')::numeric, 0) <= 0
  ) into ok;
  if not ok then raise exception 'แพ็กเกจนี้ต้องชำระเงินก่อน'; end if;
  insert into public.account_plans (user_id, plan, expires_at, updated_at, updated_by) values (auth.uid(), p_plan, null, now(), auth.uid())
    on conflict (user_id) do update set plan = excluded.plan, expires_at = null, updated_at = now(), updated_by = auth.uid();
  update public.tenants set plan = p_plan where id = any(public.owner_tenant_ids(auth.uid()));
end $$;
