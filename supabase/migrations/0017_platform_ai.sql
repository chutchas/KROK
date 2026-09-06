-- ============================================================
-- KROK · 0017_platform_ai
-- ย้ายการตั้งค่า AI (LLM) มาเป็นระดับ "แพลตฟอร์ม" ตัวเดียว
--   - ตั้งค่าได้เฉพาะ Platform Admin / Developer
--   - ทุก user / ทุก workspace เรียกใช้ผ่าน server (service role) เท่านั้น
--   - API key ไม่หลุดถึง client (RLS เปิด ไม่มี policy → เข้าถึงได้แค่ service role)
-- ============================================================

-- helper: เป็นทีมงานแพลตฟอร์ม (admin หรือ developer) ไหม
create or replace function public.is_platform_staff()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select platform_role in ('platform_admin','developer') from public.profiles where user_id = auth.uid()),
    false)
$$;

-- ตารางตั้งค่า AI ระดับแพลตฟอร์ม (แถวเดียว: id = true เสมอ)
create table if not exists public.platform_ai_settings (
  id                 boolean primary key default true check (id),
  provider           text not null default 'qwen',   -- qwen | openai | azure | anthropic
  model              text not null default '',
  base_url           text,
  azure_endpoint     text,
  azure_api_version  text,
  api_key            text,                             -- server เท่านั้น
  key_last4          text,
  updated_by         uuid references auth.users(id) on delete set null,
  updated_at         timestamptz not null default now()
);

-- เปิด RLS โดยไม่มี policy → เข้าถึงตรงไม่ได้ (นอก service role)
alter table public.platform_ai_settings enable row level security;
revoke all on public.platform_ai_settings from anon, authenticated;

-- seed แถวเดียวไว้ก่อน (ยังไม่มีคีย์)
insert into public.platform_ai_settings (id, provider, model)
  values (true, 'qwen', '')
  on conflict (id) do nothing;
