-- ============================================================
-- KROK · 0055_mfa
-- ยืนยันตัวตน 2 ขั้น (TOTP — แอป Google Authenticator / Microsoft Authenticator ฯลฯ)
-- 1. session_bundle บอกว่าผู้ใช้เปิด 2FA ไหม (mfa) → แอปพาไปกรอกรหัสก่อนใช้งาน (ไม่เพิ่ม round-trip)
-- 2. บังคับที่ฐานข้อมูล: ผู้ใช้ที่เปิด 2FA แล้วแต่ยังไม่ได้กรอกรหัส (token ระดับ aal1)
--    อ่าน/เขียนข้อมูลผ่าน REST ไม่ได้ทุกตาราง (restrictive policy) — รหัสผ่านหลุดอย่างเดียวเข้าข้อมูลไม่ได้
--    ผู้ใช้ที่ไม่ได้เปิด 2FA ใช้งานได้ตามเดิม · service role ไม่กระทบ
-- รันซ้ำได้ · ต้องรันหลัง 0054
-- ============================================================

-- ผู้ใช้ปัจจุบันผ่านเงื่อนไข 2FA ไหม: token เป็น aal2 หรือยังไม่มี factor ที่ยืนยันแล้ว
create or replace function public.mfa_ok()
returns boolean
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then return true; end if;
  if coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2' then return true; end if;
  return not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
end $$;
revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated, service_role;

-- 1) session_bundle + mfa (ห่อฟังก์ชันเดิมไว้ ไม่แก้ตรรกะเดิม)
do $$
begin
  if to_regprocedure('public._session_bundle_core(uuid)') is null then
    alter function public.session_bundle(uuid) rename to _session_bundle_core;
  end if;
end $$;
revoke all on function public._session_bundle_core(uuid) from public, anon, authenticated;

create or replace function public.session_bundle(p_wanted uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  return public._session_bundle_core(p_wanted)
    || jsonb_build_object('mfa', auth.uid() is not null and exists (
         select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'));
end $$;
grant execute on function public.session_bundle(uuid) to authenticated;

-- 2) restrictive policy บนทุกตารางที่เปิด RLS ใน public + storage.objects
do $$
declare r record;
begin
  for r in select schemaname, tablename from pg_tables
            where (schemaname = 'public' and rowsecurity) or (schemaname = 'storage' and tablename = 'objects')
  loop
    execute format('drop policy if exists krok_mfa_required on %I.%I', r.schemaname, r.tablename);
    execute format('create policy krok_mfa_required on %I.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', r.schemaname, r.tablename);
  end loop;
end $$;
