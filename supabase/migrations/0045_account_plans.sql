-- ============================================================
-- KROK · 0045_account_plans
-- แพ็กเกจผูกกับ "บัญชีผู้ใช้" (คนสมัคร) แทน workspace
-- - ทุก workspace ที่ผู้ใช้สร้าง (billing owner) ใช้แพ็กเกจของเขา
-- - โควตานับรวมทุก workspace ของเจ้าของคนเดียวกัน (pool):
--   ฟอร์ม · ผู้ใช้ (คนไม่ซ้ำ) · ส่งฟอร์ม/เดือน · พื้นที่ไฟล์ · เครดิต AI · ถังข้อมูล · Webhook · API · อุปกรณ์
-- - billing owner ของ workspace = คนสร้าง (tenants.created_by) ถ้ายังเป็น owner อยู่
--   ไม่งั้น = owner ที่เข้าร่วมก่อนสุด
-- - ย้ายข้อมูลเดิม: เจ้าของที่มีหลาย workspace ต่างแพ็กเกจ → ได้แพ็กเกจที่ราคาสูงสุด
-- ต้องรัน 0044 ก่อน · รันซ้ำได้
-- ============================================================

create table if not exists public.account_plans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan       text not null default 'free',
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.account_plans enable row level security;
revoke all on public.account_plans from anon, authenticated;
grant select on public.account_plans to authenticated;
drop policy if exists account_plans_own on public.account_plans;
create policy account_plans_own on public.account_plans for select to authenticated using (user_id = auth.uid());
-- เขียนผ่าน set_plan (security definer) / service role เท่านั้น

-- ---------- เจ้าของ (billing owner) และกลุ่ม workspace ----------
create or replace function public.tenant_billing_owner(p_tenant uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.created_by from public.tenants t
      where t.id = p_tenant and t.created_by is not null
        and exists (select 1 from public.memberships m where m.tenant_id = t.id and m.user_id = t.created_by and m.role = 'owner')),
    (select m.user_id from public.memberships m where m.tenant_id = p_tenant and m.role = 'owner' order by m.created_at limit 1),
    (select t.created_by from public.tenants t where t.id = p_tenant)
  );
$$;

-- workspace ทั้งหมดที่ผู้ใช้นี้เป็น billing owner
create or replace function public.owner_tenant_ids(p_owner uuid)
returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(c.id), '{}')
    from (
      select id from public.tenants where created_by = p_owner
      union
      select tenant_id from public.memberships where user_id = p_owner and role = 'owner'
    ) c
   where public.tenant_billing_owner(c.id) = p_owner;
$$;

-- กลุ่ม workspace ที่ใช้โควตาร่วมกับ workspace นี้ (รวมตัวเอง)
create or replace function public.tenant_pool_ids(p_tenant uuid)
returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare o uuid; ids uuid[];
begin
  if auth.uid() is not null and not (p_tenant in (select public.my_tenant_ids())) then return '{}'; end if;
  o := public.tenant_billing_owner(p_tenant);
  if o is null then return array[p_tenant]; end if;
  ids := public.owner_tenant_ids(o);
  if not (p_tenant = any(ids)) then ids := ids || p_tenant; end if;
  return ids;
end $$;

-- key แพ็กเกจที่ workspace นี้ใช้ (= แพ็กเกจของ billing owner)
create or replace function public.tenant_plan_key(p_tenant uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select a.plan from public.account_plans a where a.user_id = public.tenant_billing_owner(p_tenant)),
    'free');
$$;

revoke all on function public.tenant_billing_owner(uuid) from public, anon;
revoke all on function public.owner_tenant_ids(uuid) from public, anon;
revoke all on function public.tenant_pool_ids(uuid) from public, anon;
revoke all on function public.tenant_plan_key(uuid) from public, anon;
grant execute on function public.tenant_billing_owner(uuid) to authenticated, service_role;
grant execute on function public.tenant_pool_ids(uuid) to authenticated, service_role;
grant execute on function public.tenant_plan_key(uuid) to authenticated, service_role;
grant execute on function public.owner_tenant_ids(uuid) to service_role;

-- ---------- ย้ายข้อมูลเดิม: แพ็กเกจราคาสูงสุดในบรรดา workspace ที่เป็นเจ้าของ ----------
insert into public.account_plans (user_id, plan)
select owner, plan from (
  select distinct on (o.owner) o.owner, t.plan
    from (select id, public.tenant_billing_owner(id) as owner from public.tenants) o
    join public.tenants t on t.id = o.id
    left join lateral (
      select coalesce((x->>'priceThb')::numeric, 0) as price
        from public.platform_plan_settings s, jsonb_array_elements(coalesce(s.plans->'catalog', '[]'::jsonb)) x
       where s.id and x->>'key' = t.plan
       limit 1
    ) c on true
   where o.owner is not null
   order by o.owner, coalesce(c.price, 0) desc, (t.plan <> 'free') desc
) best
on conflict (user_id) do nothing;

-- ---------- ลิมิตของแพ็กเกจ: อ่านจากบัญชีเจ้าของ ----------
create or replace function public.plan_limit(p_tenant uuid, p_name text)
returns bigint
language plpgsql stable security definer set search_path = public as $$
declare k text; e jsonb;
begin
  if auth.uid() is not null and not (p_tenant in (select public.my_tenant_ids())) then return null; end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then return null; end if;
  k := public.tenant_plan_key(p_tenant);
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

-- ---------- เปลี่ยนแพ็กเกจ (ลูกค้าเลือกเอง): เฉพาะ billing owner ของ workspace นี้ ----------
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
  ) into ok;
  if not ok then raise exception 'แผนไม่ถูกต้อง'; end if;
  insert into public.account_plans (user_id, plan, updated_at, updated_by) values (auth.uid(), p_plan, now(), auth.uid())
    on conflict (user_id) do update set plan = excluded.plan, updated_at = now(), updated_by = auth.uid();
  -- เก็บสำเนาไว้ที่ tenants.plan (รายงาน/ข้อมูลเก่า) — ตัวจริงอยู่ที่ account_plans
  update public.tenants set plan = p_plan where id = any(public.owner_tenant_ids(auth.uid()));
end $$;

-- ---------- เครดิต AI: ยอดรวมทั้งกลุ่ม ----------
create or replace function public.ai_usage_pool_by(p_tenant uuid, p_period text, p_purpose text)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(calls), 0)::int from public.tenant_ai_usage
   where tenant_id = any(public.tenant_pool_ids(p_tenant)) and period = p_period and purpose = p_purpose;
$$;
create or replace function public.ai_usage_pool_all(p_tenant uuid, p_period text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(purpose, n), '{}'::jsonb) from (
    select purpose, sum(calls)::int n from public.tenant_ai_usage
     where tenant_id = any(public.tenant_pool_ids(p_tenant)) and period = p_period
     group by purpose) x;
$$;
revoke all on function public.ai_usage_pool_by(uuid, text, text) from public, anon;
revoke all on function public.ai_usage_pool_all(uuid, text) from public, anon;
grant execute on function public.ai_usage_pool_by(uuid, text, text) to authenticated, service_role;
grant execute on function public.ai_usage_pool_all(uuid, text) to authenticated, service_role;

-- ---------- พื้นที่ไฟล์รวมทั้งกลุ่ม ----------
create or replace function public.pool_storage_bytes(p_tenant uuid)
returns bigint
language plpgsql security definer set search_path = public as $$
declare t uuid; total bigint := 0;
begin
  foreach t in array public.tenant_pool_ids(p_tenant) loop
    total := total + coalesce(public.tenant_storage_bytes(t), 0);
  end loop;
  return total;
end $$;
revoke all on function public.pool_storage_bytes(uuid) from public, anon;
grant execute on function public.pool_storage_bytes(uuid) to authenticated, service_role;

create or replace function public.storage_quota_ok(p_bucket text, p_name text)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare t uuid; lim bigint;
begin
  if p_bucket not in ('submissions', 'attachments') then return true; end if;
  begin t := split_part(p_name, '/', 1)::uuid; exception when others then return true; end;
  lim := public.plan_limit(t, 'storageMb');
  if lim is null or lim >= 999999 then return true; end if;
  return public.pool_storage_bytes(t) < lim * 1048576;
end $$;

-- ---------- trigger โควตา: นับรวมทั้งกลุ่ม ----------
create or replace function public.zz_quota_submissions()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim bigint; used bigint;
begin
  lim := public.plan_limit(new.tenant_id, 'maxSubmissionsMonth');
  if lim is not null and lim < 999999 then
    select count(*) into used from public.submissions
     where tenant_id = any(public.tenant_pool_ids(new.tenant_id))
       and submitted_at >= (date_trunc('month', now() at time zone 'utc') at time zone 'utc');
    if used >= lim then
      perform public._quota_fail('submissions', format('ส่งฟอร์มครบ %s ครั้งของเดือนนี้แล้ว (รวมทุก workspace ของบัญชี)', lim));
    end if;
  end if;
  lim := public.plan_limit(new.tenant_id, 'storageMb');
  if lim is not null and lim < 999999 and public.pool_storage_bytes(new.tenant_id) >= lim * 1048576 then
    perform public._quota_fail('storage', format('พื้นที่ไฟล์เต็ม (%s MB รวมทุก workspace ของบัญชี)', lim));
  end if;
  return new;
end $$;

create or replace function public.zz_quota_datasets()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim bigint; used bigint; pool uuid[];
begin
  pool := public.tenant_pool_ids(new.tenant_id);
  if tg_op = 'INSERT' then
    lim := public.plan_limit(new.tenant_id, 'maxDatasets');
    if lim is not null and lim < 999999 then
      select count(*) into used from public.datasets where tenant_id = any(pool);
      if used >= lim then perform public._quota_fail('datasets', format('สร้างถังข้อมูลได้สูงสุด %s ถัง (รวมทุก workspace ของบัญชี)', lim)); end if;
    end if;
  end if;
  if new.source_kind in ('api_pull', 'api_push') and (tg_op = 'INSERT' or old.source_kind = 'file') then
    lim := public.plan_limit(new.tenant_id, 'maxDatasetApi');
    if lim is not null and lim < 999999 then
      select count(*) into used from public.datasets
       where tenant_id = any(pool) and source_kind in ('api_pull', 'api_push') and id <> new.id;
      if used >= lim then
        perform public._quota_fail('dataset_api', case when lim = 0 then 'แพ็กเกจนี้ยังเชื่อมถังข้อมูลกับ API ไม่ได้'
          else format('เชื่อมถังข้อมูลกับ API ได้สูงสุด %s ถัง (รวมทุก workspace ของบัญชี)', lim) end);
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function public.zz_quota_devices()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim bigint; used bigint;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    lim := public.plan_limit(new.tenant_id, 'maxDevices');
    if lim is not null and lim < 999999 then
      select count(*) into used from public.devices
       where tenant_id = any(public.tenant_pool_ids(new.tenant_id)) and status = 'approved' and id <> new.id;
      if used >= lim then
        perform public._quota_fail('devices', case when lim = 0 then 'แพ็กเกจนี้ยังใช้การล็อกอุปกรณ์ไม่ได้'
          else format('อนุมัติอุปกรณ์ได้สูงสุด %s เครื่อง (รวมทุก workspace ของบัญชี)', lim) end);
      end if;
    end if;
  end if;
  return new;
end $$;
