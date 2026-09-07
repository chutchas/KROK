-- KROK · 0024_tenant_notify
-- ตั้งค่าแจ้งเตือนต่อองค์กร (BYO): LINE Messaging API + Email SMTP
-- คีย์/รหัสผ่านเก็บฝั่ง server — อ่านผ่าน service role ตอนส่ง, จัดการผ่าน RLS can_manage
-- (โมเดลความปลอดภัยเดียวกับ webhooks.secret / platform_ai_settings.api_key)

create table if not exists public.tenant_notify (
  tenant_id     uuid primary key references public.tenants(id) on delete cascade,

  -- LINE Messaging API (BYO channel access token)
  line_enabled  boolean not null default false,
  line_token    text,                 -- channel access token (long-lived)
  line_target   text,                 -- userId/groupId (ว่าง = broadcast ให้ผู้ติดตาม OA ทั้งหมด)

  -- Email ผ่าน SMTP ของ tenant เอง
  email_enabled boolean not null default false,
  smtp_host     text,
  smtp_port     int,
  smtp_user     text,
  smtp_pass     text,
  email_from    text,                 -- ที่อยู่ผู้ส่ง (เช่น no-reply@company.com)
  email_to      text[] not null default '{}',  -- ผู้รับ

  -- เหตุการณ์ที่จะแจ้ง
  on_created    boolean not null default true,
  on_approved   boolean not null default false,
  on_rejected   boolean not null default true,
  fail_only     boolean not null default false, -- แจ้งเฉพาะผลไม่ผ่าน (สำหรับ submission.created)

  updated_at    timestamptz not null default now()
);

alter table public.tenant_notify enable row level security;

drop policy if exists tn_select on public.tenant_notify;
create policy tn_select on public.tenant_notify
  for select using (public.can_manage(tenant_id));

drop policy if exists tn_manage on public.tenant_notify;
create policy tn_manage on public.tenant_notify
  for all using (public.can_manage(tenant_id)) with check (public.can_manage(tenant_id));
