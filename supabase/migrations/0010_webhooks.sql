-- ============================================================
-- KROK · 0010_webhooks  (Group D · integrations)
-- ส่งข้อมูล submission ออกไปยังระบบภายนอก (webhook / API)
-- เช่น Google Sheets (Apps Script), LINE, n8n, ERP ฯลฯ
-- ============================================================

create table if not exists public.webhooks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null default 'Webhook',
  url         text not null,
  events      jsonb not null default '["submission.created"]'::jsonb,  -- created | approved | rejected
  secret      text,                    -- ใช้เซ็น payload (HMAC SHA-256)
  active      boolean not null default true,
  last_status text,
  last_at     timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_webhooks_tenant on public.webhooks(tenant_id);

alter table public.webhooks enable row level security;

-- เห็น/แก้ไขได้เฉพาะผู้จัดการ (owner/admin/designer) ของ tenant
drop policy if exists webhooks_select on public.webhooks;
create policy webhooks_select on public.webhooks
  for select using (public.can_manage(tenant_id));

drop policy if exists webhooks_manage on public.webhooks;
create policy webhooks_manage on public.webhooks
  for all using (public.can_manage(tenant_id)) with check (public.can_manage(tenant_id));
