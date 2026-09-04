-- ============================================================
-- KROK · 0007_profiles  (Group A)
-- โปรไฟล์ผู้ใช้ (ข้ามทุก workspace) + ภาษาเริ่มต้น
-- ============================================================

create table if not exists public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  first_name  text,
  last_name   text,
  phone       text,
  position    text,            -- ตำแหน่งงาน (ข้อความอิสระ)
  language    text not null default 'th',   -- th | en
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- อ่าน/เขียนได้เฉพาะโปรไฟล์ตัวเอง
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- สมาชิกใน tenant เดียวกันอ่านโปรไฟล์กันได้ (ไว้โชว์ชื่อ/ตำแหน่งในหน้า Team)
drop policy if exists profiles_read_teammates on public.profiles;
create policy profiles_read_teammates on public.profiles
  for select using (
    exists (
      select 1
      from public.memberships me
      join public.memberships them on them.tenant_id = me.tenant_id
      where me.user_id = auth.uid() and them.user_id = public.profiles.user_id
    )
  );

-- สร้างแถวโปรไฟล์ให้อัตโนมัติตอนสมัคร
create or replace function public.handle_new_profile()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, first_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)))
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_profile on auth.users;
create trigger on_auth_user_profile
  after insert on auth.users
  for each row execute function public.handle_new_profile();
