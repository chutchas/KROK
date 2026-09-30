-- ============================================================
-- KROK · 0030_datasets
-- ข้อมูลอ้างอิง (dataset) ต่อองค์กร — นำเข้าจากไฟล์ CSV/Excel, ดึงจาก API ภายนอก (pull)
-- หรือให้ระบบอื่นยิงเข้ามา (push) แล้วใช้เป็นตัวเลือกของ dropdown ในฟอร์ม
--
-- ออกแบบ:
--   datasets         : นิยาม (ชื่อ, คอลัมน์, key column, ตั้งเวลา sync) — ไม่มีความลับ สมาชิกอ่านได้
--   dataset_rows     : ข้อมูลเป็น jsonb (ไม่สร้างตารางจริงต่อ dataset → ไม่มี DDL ตอน runtime)
--   dataset_secrets  : URL/header ของ API pull + hash ของ push key — service role เท่านั้น
--   dataset_sync_runs: log การนำเข้าแต่ละครั้ง
--
-- การแทนที่ทั้งชุด (replace) ทำแบบ batch:
--   เขียนแถวใหม่ลง batch ใหม่ทีละก้อน → commit สลับ active_batch แล้วลบ batch เก่า
--   ระหว่างนำเข้า ผู้กรอกฟอร์มยังเห็นข้อมูลชุดเดิมครบ และถ้าล้มกลางทางชุดเดิมไม่เสีย
-- ============================================================

create table if not exists public.datasets (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  name             text not null,
  description      text not null default '',
  -- [{ "key": "code", "label": "รหัสลูกค้า", "type": "text" | "number" }]
  columns          jsonb not null default '[]'::jsonb,
  key_column       text,                          -- ใช้ upsert / ลบรายแถว (null = ไม่มี key)
  source_kind      text not null default 'file'
                     check (source_kind in ('file','api_pull','api_push')),
  sync_mode        text not null default 'replace' check (sync_mode in ('replace','upsert')),
  active_batch     uuid not null default gen_random_uuid(),
  row_count        int  not null default 0,
  -- ตั้งเวลา sync (เฉพาะ api_pull) : 0 = ปิด
  schedule_minutes int  not null default 0 check (schedule_minutes in (0, 15, 60, 360, 1440)),
  next_sync_at     timestamptz,
  pull_host        text not null default '',      -- แสดงผลอย่างเดียว (URL เต็มอยู่ใน secrets)
  push_key_prefix  text not null default '',      -- แสดงผลอย่างเดียว เช่น "kds_ab12"
  last_synced_at   timestamptz,
  last_sync_status text not null default '' check (last_sync_status in ('','ok','error','running')),
  last_sync_error  text not null default '',
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_datasets_tenant on public.datasets(tenant_id, name);
create index if not exists idx_datasets_due on public.datasets(next_sync_at)
  where source_kind = 'api_pull' and schedule_minutes > 0;

drop trigger if exists trg_datasets_touch on public.datasets;
create trigger trg_datasets_touch before update on public.datasets
  for each row execute function public.touch_updated_at();

alter table public.datasets enable row level security;

-- อ่าน: สมาชิกทุกคน (คนหน้างานต้องได้ตัวเลือก dropdown)
drop policy if exists datasets_select on public.datasets;
create policy datasets_select on public.datasets
  for select using (tenant_id in (select public.my_tenant_ids()));

-- สร้าง/แก้/ลบ: ผู้จัดการฟอร์ม (owner/admin/designer)
drop policy if exists datasets_manage on public.datasets;
create policy datasets_manage on public.datasets
  for all using (public.can_manage(tenant_id)) with check (public.can_manage(tenant_id));

-- ------------------------------------------------------------
create table if not exists public.dataset_rows (
  id          bigint generated always as identity primary key,
  dataset_id  uuid not null references public.datasets(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  batch       uuid not null,
  row_key     text,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create index if not exists idx_dsrows_batch on public.dataset_rows(dataset_id, batch, id);
create unique index if not exists uq_dsrows_key on public.dataset_rows(dataset_id, batch, row_key)
  where row_key is not null;

alter table public.dataset_rows enable row level security;

drop policy if exists dsrows_select on public.dataset_rows;
create policy dsrows_select on public.dataset_rows
  for select using (tenant_id in (select public.my_tenant_ids()));
-- เขียนผ่าน RPC (security definer) เท่านั้น — ไม่มี policy insert/update/delete

-- ------------------------------------------------------------
create table if not exists public.dataset_secrets (
  dataset_id    uuid primary key references public.datasets(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  -- { url, method, records_path, headers: [{name,value}], field_map: [{column, path}] }
  pull_config   jsonb not null default '{}'::jsonb,
  push_key_hash text,
  updated_at    timestamptz not null default now()
);
create index if not exists idx_dssec_pushkey on public.dataset_secrets(push_key_hash);
-- เปิด RLS แต่ไม่มี policy = เข้าถึงได้เฉพาะ service role
alter table public.dataset_secrets enable row level security;

-- ------------------------------------------------------------
create table if not exists public.dataset_sync_runs (
  id          bigint generated always as identity primary key,
  dataset_id  uuid not null references public.datasets(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  kind        text not null default 'manual' check (kind in ('manual','file','schedule','push')),
  status      text not null default 'ok' check (status in ('ok','error')),
  rows_in     int  not null default 0,
  message     text not null default '',
  actor_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_dsruns on public.dataset_sync_runs(dataset_id, created_at desc);

alter table public.dataset_sync_runs enable row level security;
drop policy if exists dsruns_select on public.dataset_sync_runs;
create policy dsruns_select on public.dataset_sync_runs
  for select using (public.can_manage(tenant_id));
drop policy if exists dsruns_insert on public.dataset_sync_runs;
create policy dsruns_insert on public.dataset_sync_runs
  for insert with check (public.can_manage(tenant_id));

-- ============================================================
-- RPC
-- เรียกได้ทั้งจากผู้ใช้ที่ can_manage (นำเข้าไฟล์จากหน้าเว็บ)
-- และจาก service role (API pull ตามเวลา / API push) ซึ่ง auth.uid() เป็น null
-- ============================================================

create or replace function public._dataset_guard(p_dataset uuid)
returns public.datasets
language plpgsql stable security definer set search_path = public as $$
declare d public.datasets;
begin
  select * into d from public.datasets where id = p_dataset;
  if not found then raise exception 'dataset not found'; end if;
  -- service role (ไม่มี auth.uid()) ผ่านได้ — route ฝั่ง server ตรวจ tenant เองแล้ว
  if auth.uid() is not null and not public.can_manage(d.tenant_id) then
    raise exception 'forbidden';
  end if;
  return d;
end $$;

-- เขียนแถว
--   p_batch = batch ใหม่ (replace: เตรียมชุดใหม่ รอ dataset_commit)
--   p_batch = null     (upsert: เขียนลง active batch "ณ ตอนเขียน" — ไม่ใช้ค่าที่อ่านไว้ก่อน
--                       กันกรณี replace สลับ batch ไปแล้วระหว่างทาง)
-- p_rows = [{ "k": "<row_key|null>", "d": { ...data } }, ...]
create or replace function public.dataset_write_rows(p_dataset uuid, p_batch uuid, p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare d public.datasets;
begin
  d := public._dataset_guard(p_dataset);
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be array'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'too many rows per call (max 5000)'; end if;
  if p_batch is null then
    -- ล็อกแถว dataset ระหว่างเขียน upsert: commit ของ replace ต้องรอให้เสร็จก่อน
    select * into d from public.datasets where id = p_dataset for update;
    p_batch := d.active_batch;
  end if;

  -- แถวที่มี key: upsert ตาม key (ซ้ำใน payload เดียวกัน → ตัวท้ายชนะ)
  insert into public.dataset_rows as r (dataset_id, tenant_id, batch, row_key, data, updated_at)
  select p_dataset, d.tenant_id, p_batch, k, dd, now()
  from (
    select distinct on (x->>'k') x->>'k' as k, coalesce(x->'d', '{}'::jsonb) as dd, ord
    from jsonb_array_elements(p_rows) with ordinality as t(x, ord)
    where nullif(x->>'k', '') is not null
    order by x->>'k', ord desc
  ) s
  on conflict (dataset_id, batch, row_key) where row_key is not null
  do update set data = excluded.data, updated_at = now();

  -- แถวที่ไม่มี key: insert ตรง ๆ
  insert into public.dataset_rows (dataset_id, tenant_id, batch, row_key, data)
  select p_dataset, d.tenant_id, p_batch, null, coalesce(x->'d', '{}'::jsonb)
  from jsonb_array_elements(p_rows) as t(x)
  where nullif(x->>'k', '') is null;

  -- เพดานกันเรียก RPC ตรงเพื่อข้ามลิมิตของแอป (แอปจำกัด 20,000 แถว)
  if (select count(*) from public.dataset_rows where dataset_id = p_dataset and batch = p_batch) > 25000 then
    raise exception 'dataset row limit exceeded';
  end if;

  return jsonb_array_length(p_rows);
end $$;

-- ลบแถวตาม key ใน active batch
create or replace function public.dataset_delete_keys(p_dataset uuid, p_keys text[])
returns int
language plpgsql security definer set search_path = public as $$
declare d public.datasets; n int;
begin
  d := public._dataset_guard(p_dataset);
  delete from public.dataset_rows
   where dataset_id = p_dataset and batch = d.active_batch and row_key = any(p_keys);
  get diagnostics n = row_count;
  update public.datasets
     set row_count = (select count(*) from public.dataset_rows where dataset_id = p_dataset and batch = d.active_batch)
   where id = p_dataset;
  return n;
end $$;

-- ยืนยัน batch ใหม่ (replace) แบบ compare-and-swap:
--   สลับได้เฉพาะเมื่อ active_batch ยังเป็น p_expected (ค่าที่อ่านไว้ก่อนเริ่มนำเข้า)
--   ถ้ามีการนำเข้าอื่น commit ไปก่อน → error ให้ลองใหม่ (ไม่เขียนทับข้อมูลที่ใหม่กว่า)
--   ลบเฉพาะ batch เดิม (+ batch ค้างที่เก่ากว่า 1 ชม.) — ไม่ลบ batch ที่การนำเข้าอื่นกำลังเตรียมอยู่
create or replace function public.dataset_commit(p_dataset uuid, p_batch uuid, p_expected uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare d public.datasets; n int;
begin
  d := public._dataset_guard(p_dataset);
  select * into d from public.datasets where id = p_dataset for update;
  if d.active_batch <> p_expected then
    raise exception 'dataset changed during import — please retry';
  end if;
  select count(*) into n from public.dataset_rows where dataset_id = p_dataset and batch = p_batch;
  update public.datasets
     set active_batch = p_batch, row_count = n,
         last_synced_at = now(), last_sync_status = 'ok', last_sync_error = ''
   where id = p_dataset;
  delete from public.dataset_rows
   where dataset_id = p_dataset
     and (batch = p_expected or (batch <> p_batch and updated_at < now() - interval '1 hour'));
  return n;
end $$;

-- หลัง upsert: นับจำนวนแถวของ active batch ใหม่ (ไม่สลับ batch)
create or replace function public.dataset_refresh(p_dataset uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare d public.datasets; n int;
begin
  d := public._dataset_guard(p_dataset);
  select count(*) into n from public.dataset_rows where dataset_id = p_dataset and batch = d.active_batch;
  update public.datasets
     set row_count = n, last_synced_at = now(), last_sync_status = 'ok', last_sync_error = ''
   where id = p_dataset;
  return n;
end $$;

-- ทิ้ง batch ที่นำเข้าไม่สำเร็จ
create or replace function public.dataset_discard(p_dataset uuid, p_batch uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare d public.datasets;
begin
  d := public._dataset_guard(p_dataset);
  if p_batch = d.active_batch then return; end if;
  delete from public.dataset_rows where dataset_id = p_dataset and batch = p_batch;
end $$;

-- อ่านตัวเลือก dropdown: ค่าไม่ซ้ำของคอลัมน์ (+ ค่าคอลัมน์กรองสำหรับ cascading)
-- RLS ของผู้เรียกยังมีผล (security invoker) — service role ใช้ในฟอร์มสาธารณะ
create or replace function public.dataset_options(p_dataset uuid, p_column text, p_parent_column text default null, p_limit int default 2000)
returns table(v text, p text)
language sql stable set search_path = public as $$
  select distinct r.data->>p_column as v,
         case when p_parent_column is null then null else r.data->>p_parent_column end as p
  from public.dataset_rows r
  join public.datasets d on d.id = r.dataset_id and d.active_batch = r.batch
  where r.dataset_id = p_dataset
    and nullif(r.data->>p_column, '') is not null
  order by 1, 2
  limit least(greatest(p_limit, 1), 5000)
$$;

-- เปิดให้ผู้ใช้ที่ล็อกอินเรียกได้ (ตรวจสิทธิ์ข้างในแล้ว) ปิด anon
revoke all on function public._dataset_guard(uuid) from public, anon, authenticated;
revoke all on function public.dataset_write_rows(uuid, uuid, jsonb) from public, anon;
revoke all on function public.dataset_delete_keys(uuid, text[]) from public, anon;
revoke all on function public.dataset_commit(uuid, uuid, uuid) from public, anon;
revoke all on function public.dataset_refresh(uuid) from public, anon;
revoke all on function public.dataset_discard(uuid, uuid) from public, anon;
revoke all on function public.dataset_options(uuid, text, text, int) from public, anon;
grant execute on function public.dataset_write_rows(uuid, uuid, jsonb) to authenticated;
grant execute on function public.dataset_delete_keys(uuid, text[]) to authenticated;
grant execute on function public.dataset_commit(uuid, uuid, uuid) to authenticated;
grant execute on function public.dataset_refresh(uuid) to authenticated;
grant execute on function public.dataset_discard(uuid, uuid) to authenticated;
grant execute on function public.dataset_options(uuid, text, text, int) to authenticated;
-- service role (API pull/push, ฟอร์มสาธารณะ) — ให้ชัดเจน ไม่พึ่ง default privileges
grant execute on function public.dataset_write_rows(uuid, uuid, jsonb) to service_role;
grant execute on function public.dataset_delete_keys(uuid, text[]) to service_role;
grant execute on function public.dataset_commit(uuid, uuid, uuid) to service_role;
grant execute on function public.dataset_refresh(uuid) to service_role;
grant execute on function public.dataset_discard(uuid, uuid) to service_role;
grant execute on function public.dataset_options(uuid, text, text, int) to service_role;

-- ============================================================
-- เมนู "ข้อมูลอ้างอิง": เปิดให้ role ที่มีเมนู studio อยู่แล้ว (คนออกแบบฟอร์ม)
-- ============================================================
update public.tenant_roles
   set menus = menus || '["datasets"]'::jsonb
 where menus ? 'studio' and not (menus ? 'datasets');

-- role ที่สร้างใหม่ภายหลัง (องค์กรใหม่ / workspace ใหม่ / role กำหนดเอง) ที่มีเมนู studio
-- ให้ได้เมนู datasets ด้วย — ไม่ต้องไปแก้ฟังก์ชัน handle_new_user ที่ hard-code รายการเมนูไว้
create or replace function public.tenant_roles_add_datasets_menu()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.menus ? 'studio' and not (new.menus ? 'datasets') then
    new.menus := new.menus || '["datasets"]'::jsonb;
  end if;
  return new;
end $$;

drop trigger if exists trg_tenant_roles_datasets on public.tenant_roles;
create trigger trg_tenant_roles_datasets before insert on public.tenant_roles
  for each row execute function public.tenant_roles_add_datasets_menu();
