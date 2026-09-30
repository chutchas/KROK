-- ============================================================
-- KROK · 0028_ai_usage_by_purpose
-- แยกโควตา AI ออกเป็นถังต่อ purpose
--
-- เหตุผล: doc_extract / photo_check ยิงมากกว่า form_gen เป็นร้อยเท่า
--        ถ้าอยู่ถังเดียวกัน ลูกค้าใช้หน้างานหนักต้นเดือน → โควตาหมด
--        → สร้างฟอร์มใหม่ไม่ได้ทั้งเดือน
--
-- หมายเหตุ: ไม่ backfill ยอดเดิมเข้าถังใหม่ (ยอดเก่าเป็นของผสม แยกไม่ได้)
--          ตัวนับใหม่เริ่มจาก 0 ในงวดปัจจุบัน — ตั้งใจให้เป็นแบบนี้
--          tenant_usage.ai_calls ยังถูกอัปเดตต่อไปในฐานะยอดรวม
--
-- หมายเหตุ 2: การสแกนบาร์โค้ด/QR ไม่ผ่านตรงนี้เลย — ถอดรหัสบนเครื่องผู้ใช้
--            ไม่มี API route ไม่หักเครดิต ไม่นับ
-- ============================================================

create table if not exists public.tenant_ai_usage (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  period     text not null,                        -- 'YYYY-MM'
  purpose    text not null
               check (purpose in ('form_gen','form_from_image','photo_check','doc_extract')),
  calls      int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, period, purpose)
);

alter table public.tenant_ai_usage enable row level security;

drop policy if exists ai_usage_select on public.tenant_ai_usage;
create policy ai_usage_select on public.tenant_ai_usage
  for select using (tenant_id in (select public.my_tenant_ids()));
-- เขียนผ่าน RPC (security definer) เท่านั้น

-- ============================================================
-- RPC: อ่านจำนวนครั้งของ purpose นั้นในงวดนี้
-- ============================================================
create or replace function public.ai_usage_get_by(p_tenant uuid, p_period text, p_purpose text)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select calls from public.tenant_ai_usage
      where tenant_id = p_tenant and period = p_period and purpose = p_purpose), 0)
  where p_tenant in (select public.my_tenant_ids());
$$;

-- ============================================================
-- RPC: อ่านทุก purpose ในงวดนี้ทีเดียว → jsonb {"purpose": calls}
-- ============================================================
create or replace function public.ai_usage_all(p_tenant uuid, p_period text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(purpose, calls), '{}'::jsonb)
  from public.tenant_ai_usage
  where tenant_id = p_tenant and period = p_period
    and p_tenant in (select public.my_tenant_ids());
$$;

-- ============================================================
-- RPC: เพิ่มตัวนับของ purpose นั้น 1 ครั้ง แล้วคืนค่าล่าสุด
--      อัปเดตยอดรวมเดิม (tenant_usage.ai_calls) ไปพร้อมกัน
-- ============================================================
create or replace function public.ai_usage_incr_by(p_tenant uuid, p_period text, p_purpose text)
returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_tenant not in (select public.my_tenant_ids()) then
    raise exception 'forbidden';
  end if;
  if p_purpose not in ('form_gen','form_from_image','photo_check','doc_extract') then
    raise exception 'purpose ไม่ถูกต้อง: %', p_purpose;
  end if;

  insert into public.tenant_ai_usage (tenant_id, period, purpose, calls, updated_at)
    values (p_tenant, p_period, p_purpose, 1, now())
  on conflict (tenant_id, period, purpose)
    do update set calls = public.tenant_ai_usage.calls + 1, updated_at = now()
  returning calls into v;

  -- ยอดรวมเดิม (รายงาน/หน้าจอเก่ายังใช้ได้)
  insert into public.tenant_usage (tenant_id, period, ai_calls, updated_at)
    values (p_tenant, p_period, 1, now())
  on conflict (tenant_id, period)
    do update set ai_calls = public.tenant_usage.ai_calls + 1, updated_at = now();

  return v;
end $$;
