-- ============================================================
-- KROK · 0018_drop_tenant_ai
-- เลิกใช้การตั้งค่า AI แบบต่อ tenant (ย้ายไปเป็นระดับแพลตฟอร์มใน 0017)
--   1) ถ้า platform ยังไม่มีคีย์ → ยกคีย์จาก tenant_ai_settings แถวล่าสุดที่มีคีย์มาใส่
--      (AI จะทำงานต่อได้ทันที ไม่ต้องกรอกใหม่)
--   2) ลบ RPC เก่า + ตาราง tenant_ai_settings (ลบ API key เก่าที่ค้างอยู่ออกด้วย)
-- ต้องรันหลัง 0017 เท่านั้น
-- ============================================================

-- 1) carry over คีย์เดิม → platform (เฉพาะกรณี platform ยังไม่มีคีย์)
update public.platform_ai_settings p
set provider          = coalesce(nullif(t.provider,''), p.provider),
    model             = coalesce(nullif(t.model,''), p.model),
    base_url          = t.base_url,
    azure_endpoint    = t.azure_endpoint,
    azure_api_version = t.azure_api_version,
    api_key           = t.api_key,
    key_last4         = t.key_last4,
    updated_at        = now()
from (
  select * from public.tenant_ai_settings
  where api_key is not null and api_key <> ''
  order by updated_at desc
  limit 1
) t
where p.id = true and (p.api_key is null or p.api_key = '');

-- 2) ลบของเก่า
drop function if exists public.ai_settings_get();
drop function if exists public.ai_settings_set(text, text, text, text, text, text);
drop table if exists public.tenant_ai_settings;
