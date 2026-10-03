-- ============================================================
-- KROK · 0052_ai_credit_lock
-- ตัวนับเครดิต AI เรียกได้จาก server (service role) เท่านั้น — ผู้ใช้ยิง RPC ตรงไม่ได้
-- (แอปนับเครดิตด้วย service role อยู่แล้วตั้งแต่ r52) · รันซ้ำได้
-- ============================================================

create or replace function public.ai_usage_incr_by(p_tenant uuid, p_period text, p_purpose text)
returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  -- service role ไม่มี auth.uid() · ผู้ใช้ที่ยังเรียกได้ (ก่อน revoke) ต้องเป็นสมาชิก
  if auth.uid() is not null and p_tenant not in (select public.my_tenant_ids()) then
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

  insert into public.tenant_usage (tenant_id, period, ai_calls, updated_at)
    values (p_tenant, p_period, 1, now())
  on conflict (tenant_id, period)
    do update set ai_calls = public.tenant_usage.ai_calls + 1, updated_at = now();

  return v;
end $$;

revoke all on function public.ai_usage_incr_by(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ai_usage_incr_by(uuid, text, text) to service_role;
revoke all on function public.ai_usage_incr(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_usage_incr(uuid, text) to service_role;
