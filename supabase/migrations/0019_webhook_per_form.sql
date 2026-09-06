-- ============================================================
-- KROK · 0019_webhook_per_form
-- Webhook แบบ "รายฟอร์ม" + เลือกฟิลด์ที่จะส่งออก (payload)
--   - form_id: ผูกกับฟอร์มใดฟอร์มหนึ่ง (NULL = ทุกฟอร์ม ตามพฤติกรรมเดิม)
--   - fields:  รายการ field id ที่จะส่งใน answers (ว่าง = ส่งทุกฟิลด์)
-- ============================================================

alter table public.webhooks
  add column if not exists form_id uuid references public.forms(id) on delete cascade,
  add column if not exists fields  jsonb not null default '[]'::jsonb;

create index if not exists idx_webhooks_tenant_form on public.webhooks(tenant_id, form_id);
