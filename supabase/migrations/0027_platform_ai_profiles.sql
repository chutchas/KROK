-- ============================================================
-- KROK · 0027_platform_ai_profiles
-- แยกการตั้งค่า LLM ออกเป็น "profile ต่อ purpose"
--   form_gen         สร้าง/แก้ฟอร์มจาก prompt   (ไม่ต้อง vision, ปริมาณต่ำ, ฉลาด)
--   form_from_image  สร้างฟอร์มจากรูปฟอร์มเดิม  (vision, ปริมาณต่ำ, ฉลาด)
--   photo_check      ตรวจรูปหน้างาน             (vision, ปริมาณสูง, ถูก)
--   doc_extract      ดึงข้อมูลจากเอกสาร         (vision, ปริมาณสูง, ถูก + OCR ไทย)
--
-- หมายเหตุ: ยังไม่ drop platform_ai_settings (0017) — เก็บไว้อีก 1 release
--           เผื่อ rollback แล้วค่อยลบใน migration ถัดไป
-- ============================================================

create table if not exists public.platform_ai_profiles (
  purpose           text primary key
                      check (purpose in ('form_gen','form_from_image','photo_check','doc_extract')),
  enabled           boolean not null default true,
  provider          text not null default 'qwen',   -- qwen | openai | azure | anthropic
  model             text not null default '',
  base_url          text,
  azure_endpoint    text,
  azure_api_version text,
  api_key           text,                            -- server เท่านั้น
  key_last4         text,
  updated_by        uuid references auth.users(id) on delete set null,
  updated_at        timestamptz not null default now()
);

-- เปิด RLS โดยไม่มี policy → เข้าถึงตรงไม่ได้ (นอก service role) เหมือน 0017
alter table public.platform_ai_profiles enable row level security;
revoke all on public.platform_ai_profiles from anon, authenticated;

-- ------------------------------------------------------------
-- seed 1: คัดลอกค่าเดิมจาก platform_ai_settings ลงทุก purpose
--         → deploy แล้วพฤติกรรมเหมือนเดิมเป๊ะ ไม่มีอะไรพัง
-- ------------------------------------------------------------
insert into public.platform_ai_profiles
  (purpose, provider, model, base_url, azure_endpoint, azure_api_version,
   api_key, key_last4, updated_by, updated_at)
select p.purpose, s.provider, s.model, s.base_url, s.azure_endpoint, s.azure_api_version,
       s.api_key, s.key_last4, s.updated_by, s.updated_at
from public.platform_ai_settings s
cross join (values ('form_gen'),('form_from_image'),('photo_check'),('doc_extract')) as p(purpose)
where s.id = true
on conflict (purpose) do nothing;

-- ------------------------------------------------------------
-- seed 2: เผื่อยังไม่เคยมีแถวใน platform_ai_settings เลย
-- ------------------------------------------------------------
insert into public.platform_ai_profiles (purpose, provider, model)
values ('form_gen','qwen',''),
       ('form_from_image','qwen',''),
       ('photo_check','qwen',''),
       ('doc_extract','qwen','')
on conflict (purpose) do nothing;
