-- ============================================================
-- KROK · bootstrap_platform_admin.sql  (รันครั้งเดียวด้วยมือใน Supabase SQL Editor)
-- ตั้ง Platform Admin คนแรก — จำเป็นก่อนใช้หน้า ตั้งค่าระบบ / จัดการผู้ใช้ / Audit ทั้งระบบ
--
-- หมายเหตุ: migration 0011 hardcode อีเมลที่ไม่มีอยู่จริง จึงยังไม่มี platform admin เลย
-- สคริปต์นี้ตั้งให้ตามอีเมลจริงที่มีในระบบ (ต้องเคย sign up / มี row ใน auth.users แล้ว)
-- ============================================================

-- 1) test@mail.com → Platform Admin (สิทธิ์สูงสุดระดับแพลตฟอร์ม)
insert into public.profiles (user_id, platform_role)
select id, 'platform_admin'
from auth.users
where email = 'test@mail.com'
on conflict (user_id) do update set platform_role = 'platform_admin';

-- 2) (ตัวเลือก) innolistic@mail.com → Developer (ตั้งค่า AI/Payment/Plan ได้ แต่ไม่เห็น Audit ทั้งระบบ)
-- ถ้าต้องการให้เป็น Developer ให้เอา comment ออก:
-- insert into public.profiles (user_id, platform_role)
-- select id, 'developer'
-- from auth.users
-- where email = 'innolistic@mail.com'
-- on conflict (user_id) do update set platform_role = 'developer';

-- 3) ตรวจผล — ควรเห็น platform_role อัปเดตแล้ว
select u.email, p.platform_role
from public.profiles p
join auth.users u on u.id = p.user_id
where u.email in ('test@mail.com', 'innolistic@mail.com');
