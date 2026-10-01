-- ============================================================
-- KROK · 0041_tours_seen
-- ทัวร์แนะนำการใช้งาน: จำว่าผู้ใช้ดู/ข้ามทัวร์ไหนแล้ว (ข้ามทุกเครื่อง ไม่พาซ้ำ)
-- ============================================================

alter table public.profiles
  add column if not exists tours_seen text[] not null default '{}';

-- เพิ่ม key ทัวร์ที่ดูแล้ว (ไม่ซ้ำ) — security invoker: RLS profiles_self จำกัดให้แก้ได้เฉพาะของตัวเอง
create or replace function public.mark_tour_seen(p_key text)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.profiles (user_id, tours_seen)
  values (auth.uid(), array[left(coalesce(p_key, ''), 40)])
  on conflict (user_id) do update
    set tours_seen = (
      select coalesce(array_agg(distinct k), '{}')
      from unnest(public.profiles.tours_seen || excluded.tours_seen) as k
      where k <> ''
    );
$$;

grant execute on function public.mark_tour_seen(text) to authenticated;
