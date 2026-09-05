-- ============================================================
-- KROK · 0012_invoices
-- ใบแจ้งหนี้/ใบเสร็จของการสมัครแผน (โครงพื้นฐานสำหรับระบบชำระเงิน)
-- เดโม: ออกใบแจ้งหนี้สถานะ 'demo' ตอนเปลี่ยนไปแผนเสียเงิน ยังไม่เรียกเก็บจริง
-- เมื่อผูก payment gateway จริง: อัปเดต status เป็น paid/pending/void ผ่าน webhook
-- ============================================================

create table if not exists public.invoices (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  number     text,                                  -- เลขที่ใบแจ้งหนี้ (ออกให้อัตโนมัติ)
  plan       text not null,
  amount     int  not null default 0,               -- ยอด (บาท)
  currency   text not null default 'THB',
  period     text not null,                         -- YYYY-MM
  status     text not null default 'demo'
             check (status in ('demo','pending','paid','void','failed')),
  note       text,
  issued_by  uuid references auth.users(id) on delete set null,
  issued_at  timestamptz not null default now(),
  paid_at    timestamptz
);
create index if not exists idx_invoices_tenant on public.invoices(tenant_id, issued_at desc);

-- เลขที่ใบแจ้งหนี้อัตโนมัติ: INV-YYYYMM-<6 หลัก>
create or replace function public.set_invoice_number()
returns trigger language plpgsql as $$
begin
  if new.number is null then
    new.number := 'INV-' || to_char(now(),'YYYYMM') || '-' || lpad((floor(random()*1000000))::int::text, 6, '0');
  end if;
  return new;
end $$;
drop trigger if exists trg_invoice_number on public.invoices;
create trigger trg_invoice_number before insert on public.invoices
  for each row execute function public.set_invoice_number();

alter table public.invoices enable row level security;

-- อ่านได้เฉพาะผู้จัดการบิลของ workspace (owner/admin)
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select using (public.my_role(tenant_id) in ('owner','admin'));

drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices
  for insert with check (public.my_role(tenant_id) in ('owner','admin'));
