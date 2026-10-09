-- ============================================================
-- 0077 · เลขที่เอกสารแบบรัน (ตั้งต่อฟอร์ม)
-- ฟอร์มตั้ง schema.doc_no = { prefix, reset: none|year|month, digits }
-- เลขออกตอนบันทึกใบ (trigger ก่อน insert) — ทุกช่องทาง: /api/submit, /api/public/submit, intake
-- ฟอร์มที่ prefix เดียวกันใช้ตัวนับร่วมกัน (ไม่ชนกันใน workspace) · ใบเก่าไม่มีเลข = แสดงรหัส 8 ตัวเหมือนเดิม
-- insert ล้ม (เช่น id ซ้ำ) = ตัวนับย้อนตามทั้ง transaction → ไม่มีเลขข้าม
-- ============================================================

alter table public.submissions add column if not exists doc_no text;
create index if not exists idx_sub_doc_no on public.submissions(tenant_id, doc_no) where doc_no is not null;

create table if not exists public.doc_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stem      text not null,           -- ส่วนหน้าของเลข เช่น 'FL-6910-' (prefix + งวด)
  seq       int  not null,
  primary key (tenant_id, stem)
);
alter table public.doc_counters enable row level security;
-- ไม่มี policy: อ่าน/เขียนผ่าน function ด้านล่างเท่านั้น

-- เลขถัดไปของ stem (prefix + งวด) · ปี/เดือนเป็น พ.ศ. ตามเวลาไทย
create or replace function public.next_doc_no(p_tenant uuid, p_cfg jsonb, p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := left(btrim(coalesce(p_cfg->>'prefix', '')), 20);
  v_reset  text := coalesce(p_cfg->>'reset', 'none');
  v_digits int;
  v_t    timestamp := (coalesce(p_at, now()) at time zone 'Asia/Bangkok');
  v_yy   text := lpad(((extract(year from v_t)::int + 543) % 100)::text, 2, '0');
  v_stem   text;
  v_n    int;
begin
  if v_prefix = '' then return null; end if;
  begin
    v_digits := (p_cfg->>'digits')::int;
  exception when others then
    v_digits := null;
  end;
  v_digits := least(greatest(coalesce(v_digits, 4), 3), 8);
  v_stem := case v_reset
    when 'year'  then v_prefix || v_yy || '-'
    when 'month' then v_prefix || v_yy || to_char(v_t, 'MM') || '-'
    else v_prefix
  end;
  insert into public.doc_counters as c (tenant_id, stem, seq) values (p_tenant, v_stem, 1)
  on conflict (tenant_id, stem) do update set seq = c.seq + 1
  returning c.seq into v_n;
  return v_stem || lpad(v_n::text, v_digits, '0');
end;
$$;
revoke all on function public.next_doc_no(uuid, jsonb, timestamptz) from public, anon, authenticated;

create or replace function public.submissions_doc_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
begin
  -- ค่าที่ส่งมากับ insert ไม่นับ (กันตั้งเลขเอง) — ออกเลขจากการตั้งค่าฟอร์มเท่านั้น
  new.doc_no := null;
  select f.schema->'doc_no' into cfg from public.forms f where f.id = new.form_id and f.tenant_id = new.tenant_id;
  if cfg is null or jsonb_typeof(cfg) <> 'object' then return new; end if;
  new.doc_no := public.next_doc_no(new.tenant_id, cfg, new.submitted_at);
  return new;
end;
$$;

drop trigger if exists submissions_doc_no on public.submissions;
create trigger submissions_doc_no
  before insert on public.submissions
  for each row execute function public.submissions_doc_no();

-- เลขที่เอกสารออกโดยระบบเท่านั้น — ผู้ใช้แก้ใบ (update) เปลี่ยนเลขไม่ได้
create or replace function public.submissions_doc_no_lock()
returns trigger
language plpgsql
as $$
begin
  new.doc_no := old.doc_no;
  return new;
end;
$$;
drop trigger if exists submissions_doc_no_lock on public.submissions;
create trigger submissions_doc_no_lock
  before update of doc_no on public.submissions
  for each row when (new.doc_no is distinct from old.doc_no)
  execute function public.submissions_doc_no_lock();
