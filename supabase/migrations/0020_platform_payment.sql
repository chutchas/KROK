-- 0020_platform_payment.sql
-- ตั้งค่าระบบชำระเงินระดับแพลตฟอร์ม (singleton) — คีย์เก็บฝั่ง server เท่านั้น
-- providers jsonb ตัวอย่าง:
-- {
--   "stripe":   {"enabled": true,  "secret_key": "sk_...", "webhook_secret": "whsec_...", "key_last4": "1234"},
--   "omise":    {"enabled": false, "public_key": "pkey_...", "secret_key": "skey_...", "key_last4": "abcd"},
--   "2c2p":     {"enabled": false, "merchant_id": "764...", "secret_key": "...", "key_last4": "wxyz"},
--   "promptpay":{"enabled": true,  "promptpay_id": "0812345678"}
-- }
create table if not exists public.platform_payment_settings (
  id boolean primary key default true,
  providers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint platform_payment_singleton check (id)
);

alter table public.platform_payment_settings enable row level security;
-- ไม่มี policy: เข้าถึงได้เฉพาะ service-role (เหมือน platform_ai_settings) กันคีย์รั่ว
revoke all on public.platform_payment_settings from anon, authenticated;

insert into public.platform_payment_settings (id, providers)
  values (true, '{}'::jsonb)
  on conflict (id) do nothing;
