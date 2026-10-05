-- ============================================================
-- KROK · 0063_quota_members
-- นับสมาชิกไม่ซ้ำของกลุ่ม workspace ในฐานข้อมูล (เดิมดึง user_id สูงสุด 50,000 แถวมานับในแอปทุกครั้งที่เปิดหน้าโควตา)
-- เรียกได้เฉพาะ service role · รันซ้ำได้ · ต้องรันหลัง 0062
-- ============================================================
create or replace function public.pool_member_count(p_ids uuid[])
returns int language sql stable security definer set search_path = public as $$
  select count(distinct user_id)::int from public.memberships where tenant_id = any(p_ids)
$$;
revoke all on function public.pool_member_count(uuid[]) from public, anon, authenticated;
grant execute on function public.pool_member_count(uuid[]) to service_role;
