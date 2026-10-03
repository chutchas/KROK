-- ============================================================
-- KROK · 0051_account_deletion
-- ลบบัญชีด้วยตัวเอง (หน้าโปรไฟล์) — workspace ที่มีแค่เจ้าของจะถูกลบทั้งหมด
-- แต่ใบแจ้งหนี้/ใบเสร็จต้องเก็บตามกฎหมายบัญชี-ภาษี → ไม่ลบตาม workspace (tenant_id = null แทน)
-- ยังไม่รัน = ปุ่มลบบัญชีจะแจ้งให้รัน migration นี้ก่อน ถ้า workspace นั้นมีใบแจ้งหนี้
-- รันซ้ำได้ · ต้องรันหลัง 0046
-- ============================================================

alter table public.invoices alter column tenant_id drop not null;
alter table public.invoices drop constraint if exists invoices_tenant_id_fkey;
alter table public.invoices add constraint invoices_tenant_id_fkey
  foreign key (tenant_id) references public.tenants(id) on delete set null;
