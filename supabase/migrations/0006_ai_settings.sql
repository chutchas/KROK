-- ============================================================
-- KROK · 0006_ai_settings  (Phase 3.1)
-- ตั้งค่า LLM provider ต่อ tenant จากหน้า admin (ไม่ต้อง redeploy)
--
-- ความปลอดภัยของ API key:
--   - ตาราง tenant_ai_settings เปิด RLS แต่ "ไม่มี policy" ให้ client เลย
--     → PostgREST/anon/authenticated อ่าน/เขียนตรงไม่ได้ (คีย์ไม่หลุด)
--   - หน้า admin ใช้ 2 RPC (SECURITY DEFINER):
--       ai_settings_get()  → คืนเฉพาะฟิลด์ปลอดภัย (ไม่มี api_key, มีแค่ 4 ตัวท้าย)
--       ai_settings_set(...) → upsert (manager เท่านั้น); ถ้าไม่ส่ง key มาก็คงของเดิม
--   - ตอนเรียก LLM จริง server อ่าน api_key ผ่าน service role (bypass RLS)
-- ============================================================

create table if not exists public.tenant_ai_settings (
  tenant_id          uuid primary key references public.tenants(id) on delete cascade,
  provider           text not null default 'qwen',   -- qwen | openai | azure | anthropic
  model              text not null default '',
  base_url           text,
  azure_endpoint     text,
  azure_api_version  text,
  api_key            text,                             -- ห้าม select จาก client
  key_last4          text,
  updated_by         uuid references auth.users(id) on delete set null,
  updated_at         timestamptz not null default now()
);

-- เปิด RLS แต่ตั้งใจไม่ประกาศ policy ใดๆ → ไม่มีใคร (นอก service role) เข้าถึงตรงได้
alter table public.tenant_ai_settings enable row level security;
revoke all on public.tenant_ai_settings from anon, authenticated;

-- ---------- get: ฟิลด์ปลอดภัยของ tenant ผู้เรียก ----------
create or replace function public.ai_settings_get()
returns table (
  provider text, model text, base_url text,
  azure_endpoint text, azure_api_version text,
  key_last4 text, has_key boolean, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare t uuid;
begin
  select tenant_id into t from public.memberships
  where user_id = auth.uid() and role in ('owner','admin') limit 1;
  if t is null then return; end if;  -- ไม่ใช่ manager → ไม่คืนอะไร

  return query
    select s.provider, s.model, s.base_url, s.azure_endpoint, s.azure_api_version,
           s.key_last4, (s.api_key is not null and s.api_key <> '') as has_key, s.updated_at
    from public.tenant_ai_settings s
    where s.tenant_id = t;
end $$;

-- ---------- set: upsert config (manager เท่านั้น) ----------
-- p_api_key = null/'' → คงคีย์เดิมไว้ (ใช้ตอนแก้แค่ provider/model)
create or replace function public.ai_settings_set(
  p_provider text,
  p_model text,
  p_base_url text,
  p_azure_endpoint text,
  p_azure_api_version text,
  p_api_key text
)
returns void
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select tenant_id into t from public.memberships
  where user_id = auth.uid() and role in ('owner','admin') limit 1;
  if t is null then raise exception 'ต้องเป็น owner/admin เท่านั้น'; end if;

  insert into public.tenant_ai_settings as s
    (tenant_id, provider, model, base_url, azure_endpoint, azure_api_version,
     api_key, key_last4, updated_by, updated_at)
  values
    (t, coalesce(p_provider,'qwen'), coalesce(p_model,''), nullif(p_base_url,''),
     nullif(p_azure_endpoint,''), nullif(p_azure_api_version,''),
     nullif(p_api_key,''),
     case when nullif(p_api_key,'') is not null then right(p_api_key, 4) else null end,
     auth.uid(), now())
  on conflict (tenant_id) do update set
     provider          = excluded.provider,
     model             = excluded.model,
     base_url          = excluded.base_url,
     azure_endpoint    = excluded.azure_endpoint,
     azure_api_version = excluded.azure_api_version,
     api_key           = coalesce(nullif(p_api_key,''), s.api_key),
     key_last4         = case when nullif(p_api_key,'') is not null
                              then right(p_api_key,4) else s.key_last4 end,
     updated_by        = auth.uid(),
     updated_at        = now();
end $$;

revoke all on function public.ai_settings_set(text,text,text,text,text,text) from anon;
