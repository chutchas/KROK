-- ============================================================
-- KROK · 0044_plan_catalog
-- แคตตาล็อกแพ็กเกจแบบไดนามิก (Platform Admin สร้างแพ็กเกจเพิ่มได้) + บังคับโควตาฝั่ง DB
--
-- 1) platform_plan_settings.plans → รูปแบบ { "v": 2, "catalog": [ {key, name, priceThb, ...ลิมิต}, ... ] }
--    แปลงค่าเดิม (override ของ free/pro/business) ให้อัตโนมัติ · ราคาอ่านได้ทั้งผู้ไม่ล็อกอิน (หน้า home)
-- 2) public.plan_limit(tenant, ชื่อลิมิต) — ลิมิตของแพ็กเกจที่ workspace ใช้อยู่ (null = ไม่บังคับ)
-- 3) set_plan รับ key ใดก็ได้ที่อยู่ในแคตตาล็อกและเปิดให้ลูกค้าเลือก
-- 4) บังคับใช้: ส่งฟอร์ม/เดือน · จำนวนถังข้อมูล · ถังข้อมูลแบบ API · แถวต่อถัง · อุปกรณ์ที่อนุมัติ · พื้นที่ไฟล์
--    ของที่มีอยู่เกินลิมิตแล้ว "ใช้ต่อได้" — บล็อกเฉพาะการเพิ่มใหม่
-- รันซ้ำได้
-- ============================================================

-- 1) ราคาไม่ใช่ความลับ — ผู้ไม่ล็อกอินอ่านได้ (หน้า home แสดงแพ็กเกจ)
drop policy if exists platform_plan_read_anon on public.platform_plan_settings;
create policy platform_plan_read_anon on public.platform_plan_settings
  for select to anon using (true);
grant select on public.platform_plan_settings to anon;

insert into public.platform_plan_settings (id, plans) values (true, '{}'::jsonb) on conflict (id) do nothing;

-- แปลงรูปแบบเดิม → v2 (ค่าเริ่มต้นต้องตรงกับ DEFAULT_PLANS ใน src/lib/plans.ts)
do $$
declare
  cur jsonb;
  defs jsonb := '[
    {"key":"free","name":"เริ่มต้น","nameEn":"Free","desc":"ทดลองใช้ ทีมเล็ก","descEn":"Try it out, small teams",
     "priceThb":0,"sort":10,"visible":true,"highlight":false,"extras":[],"extrasEn":[],
     "aiCredits":{"form_gen":20,"form_from_image":10,"photo_check":100,"doc_extract":50},
     "maxForms":3,"maxMembers":3,"maxWorkspaces":1,"maxSubmissionsMonth":300,"storageMb":1024,
     "maxDatasets":2,"maxDatasetRows":1000,"maxWebhooks":0,"maxIntakeForms":0,"maxDatasetApi":0,
     "maxApprovalSteps":1,"maxDevices":0,"auditDays":7,"notify":false,"workflow":false},
    {"key":"pro","name":"โปร","nameEn":"Pro","desc":"ทีมที่ใช้งานจริงทุกวัน","descEn":"For teams in daily operation",
     "priceThb":990,"sort":20,"visible":true,"highlight":true,"extras":[],"extrasEn":[],
     "aiCredits":{"form_gen":200,"form_from_image":100,"photo_check":3000,"doc_extract":1500},
     "maxForms":25,"maxMembers":20,"maxWorkspaces":3,"maxSubmissionsMonth":5000,"storageMb":20480,
     "maxDatasets":20,"maxDatasetRows":20000,"maxWebhooks":3,"maxIntakeForms":3,"maxDatasetApi":3,
     "maxApprovalSteps":3,"maxDevices":20,"auditDays":90,"notify":true,"workflow":true},
    {"key":"business","name":"ธุรกิจ","nameEn":"Business","desc":"หลายสาขา เชื่อมระบบเต็มรูปแบบ","descEn":"Multi-site, full integration",
     "priceThb":2990,"sort":30,"visible":true,"highlight":false,"extras":[],"extrasEn":[],
     "aiCredits":{"form_gen":1000,"form_from_image":500,"photo_check":30000,"doc_extract":15000},
     "maxForms":999999,"maxMembers":200,"maxWorkspaces":20,"maxSubmissionsMonth":999999,"storageMb":204800,
     "maxDatasets":999999,"maxDatasetRows":200000,"maxWebhooks":20,"maxIntakeForms":999999,"maxDatasetApi":20,
     "maxApprovalSteps":999999,"maxDevices":999999,"auditDays":365,"notify":true,"workflow":true}
  ]'::jsonb;
  d jsonb; o jsonb; ai jsonb; outv jsonb := '[]'::jsonb; n jsonb;
begin
  select plans into cur from public.platform_plan_settings where id;
  if coalesce(cur->>'v', '') = '2' then return; end if;
  for d in select * from jsonb_array_elements(defs) loop
    o := coalesce(cur -> (d->>'key'), '{}'::jsonb);
    ai := d->'aiCredits';
    if o ? 'aiCredits' and jsonb_typeof(o->'aiCredits') = 'object' then
      ai := ai || (o->'aiCredits');
    elsif jsonb_typeof(o->'aiCreditsPerMonth') = 'number' then
      n := o->'aiCreditsPerMonth';
      ai := jsonb_build_object('form_gen', n, 'form_from_image', n, 'photo_check', n, 'doc_extract', n);
    end if;
    -- เก็บเฉพาะค่าที่เคยตั้ง (ชื่อว่าง = ใช้ค่าเริ่มต้น)
    o := o - 'aiCredits' - 'aiCreditsPerMonth';
    if coalesce(btrim(o->>'name'), '') = '' then o := o - 'name'; end if;
    if coalesce(btrim(o->>'nameEn'), '') = '' then o := o - 'nameEn'; end if;
    outv := outv || jsonb_build_array(d || o || jsonb_build_object('aiCredits', ai));
  end loop;
  update public.platform_plan_settings
     set plans = jsonb_build_object('v', 2, 'catalog', outv), updated_at = now()
   where id;
end $$;

-- 2) ลิมิตของแพ็กเกจที่ workspace ใช้อยู่ — ตัวเลข / boolean (1|0) · ไม่พบ = null (ไม่บังคับ)
--    key ที่ไม่อยู่ในแคตตาล็อก (ถูกลบ) = ใช้ลิมิตของ free
create or replace function public.plan_limit(p_tenant uuid, p_name text)
returns bigint
language plpgsql stable security definer set search_path = public as $$
declare k text; e jsonb;
begin
  -- ผู้ใช้ทั่วไปถามได้เฉพาะ workspace ของตัวเอง (service role/trigger ไม่มี auth.uid())
  if auth.uid() is not null and not (p_tenant in (select public.my_tenant_ids())) then return null; end if;
  select coalesce(plan, 'free') into k from public.tenants where id = p_tenant;
  if k is null then return null; end if;
  select x into e
    from public.platform_plan_settings s, jsonb_array_elements(coalesce(s.plans->'catalog', '[]'::jsonb)) x
   where s.id and x->>'key' in (k, 'free')
   order by (x->>'key' = k) desc
   limit 1;
  if e is null then return null; end if;
  return case jsonb_typeof(e->p_name)
    when 'boolean' then case when (e->>p_name)::boolean then 1 else 0 end
    when 'number'  then floor((e->>p_name)::numeric)::bigint
    else null end;
end $$;
revoke all on function public.plan_limit(uuid, text) from public, anon;
grant execute on function public.plan_limit(uuid, text) to authenticated, service_role;

-- 3) เปลี่ยนแผน: key ต้องอยู่ในแคตตาล็อกและเปิดให้ลูกค้าเลือก (หรือเป็นแผนปัจจุบัน)
create or replace function public.set_plan(p_tenant uuid, p_plan text)
returns void
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if public.my_role(p_tenant) <> 'owner' then
    raise exception 'เฉพาะ owner เปลี่ยนแผนได้';
  end if;
  select exists (
    select 1 from public.platform_plan_settings s, jsonb_array_elements(coalesce(s.plans->'catalog', '[]'::jsonb)) x
     where s.id and x->>'key' = p_plan and (coalesce((x->>'visible')::boolean, true) or p_plan = 'free')
  ) or (p_plan in ('free','pro','business') and not exists (
    select 1 from public.platform_plan_settings s where s.id and s.plans->>'v' = '2'
  )) into ok;
  if not ok then raise exception 'แผนไม่ถูกต้อง'; end if;
  update public.tenants set plan = p_plan where id = p_tenant;
end $$;

-- ข้อความ error มาตรฐาน: อ่านรู้เรื่อง + มีแท็ก [quota:<ชื่อ>] ให้แอปจับได้
create or replace function public._quota_fail(p_name text, p_msg text)
returns void language plpgsql as $$
begin
  raise exception '% — อัปเกรดแพ็กเกจเพื่อเพิ่มโควตา [quota:%]', p_msg, p_name using errcode = 'P0001';
end $$;

-- 4.1) ส่งฟอร์มต่อเดือน (นับทุกช่องทาง: แอป/ฟอร์มสาธารณะ/API/งานหลายคน)
--      + พื้นที่ไฟล์เต็ม = ส่งใหม่ไม่ได้ (บอกชัดก่อนอัปโหลดรูป แทนที่รูปจะหายเงียบ ๆ)
--      ฟังก์ชัน storage อยู่ข้อ 4.5 — สร้าง trigger หลังจากนั้น
create or replace function public.zz_quota_submissions()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim bigint; used bigint;
begin
  lim := public.plan_limit(new.tenant_id, 'maxSubmissionsMonth');
  if lim is not null and lim < 999999 then
    select count(*) into used from public.submissions
     where tenant_id = new.tenant_id and submitted_at >= (date_trunc('month', now() at time zone 'utc') at time zone 'utc');
    if used >= lim then
      perform public._quota_fail('submissions', format('ส่งฟอร์มครบ %s ครั้งของเดือนนี้แล้ว', lim));
    end if;
  end if;
  lim := public.plan_limit(new.tenant_id, 'storageMb');
  if lim is not null and lim < 999999 and coalesce(public.tenant_storage_bytes(new.tenant_id), 0) >= lim * 1048576 then
    perform public._quota_fail('storage', format('พื้นที่ไฟล์เต็ม (%s MB)', lim));
  end if;
  return new;
end $$;

-- 4.2) ถังข้อมูล: จำนวนถัง + ถังที่เชื่อม API (pull/push)
create or replace function public.zz_quota_datasets()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim bigint; used bigint;
begin
  if tg_op = 'INSERT' then
    lim := public.plan_limit(new.tenant_id, 'maxDatasets');
    if lim is not null and lim < 999999 then
      select count(*) into used from public.datasets where tenant_id = new.tenant_id;
      if used >= lim then perform public._quota_fail('datasets', format('สร้างถังข้อมูลได้สูงสุด %s ถัง', lim)); end if;
    end if;
  end if;
  if new.source_kind in ('api_pull', 'api_push') and (tg_op = 'INSERT' or old.source_kind = 'file') then
    lim := public.plan_limit(new.tenant_id, 'maxDatasetApi');
    if lim is not null and lim < 999999 then
      select count(*) into used from public.datasets
       where tenant_id = new.tenant_id and source_kind in ('api_pull', 'api_push') and id <> new.id;
      if used >= lim then
        perform public._quota_fail('dataset_api', case when lim = 0 then 'แพ็กเกจนี้ยังเชื่อมถังข้อมูลกับ API ไม่ได้'
          else format('เชื่อมถังข้อมูลกับ API ได้สูงสุด %s ถัง', lim) end);
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists zz_quota_datasets on public.datasets;
create trigger zz_quota_datasets before insert or update of source_kind on public.datasets
  for each row execute function public.zz_quota_datasets();

-- 4.3) แถวต่อถัง — แทนเพดานคงที่ 25,000 ด้วยลิมิตของแพ็กเกจ (ไม่มีลิมิต = 20,000 เท่าเดิม · เพดานสูงสุด 250,000)
create or replace function public.dataset_write_rows(p_dataset uuid, p_batch uuid, p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare d public.datasets; lim bigint;
begin
  d := public._dataset_guard(p_dataset);
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be array'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'too many rows per call (max 5000)'; end if;
  if p_batch is null then
    select * into d from public.datasets where id = p_dataset for update;
    p_batch := d.active_batch;
  end if;

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

  insert into public.dataset_rows (dataset_id, tenant_id, batch, row_key, data)
  select p_dataset, d.tenant_id, p_batch, null, coalesce(x->'d', '{}'::jsonb)
  from jsonb_array_elements(p_rows) as t(x)
  where nullif(x->>'k', '') is null;

  lim := least(coalesce(public.plan_limit(d.tenant_id, 'maxDatasetRows'), 20000), 250000);
  if (select count(*) from public.dataset_rows where dataset_id = p_dataset and batch = p_batch) > lim then
    raise exception 'dataset row limit exceeded (max %) [quota:dataset_rows]', lim;
  end if;

  return jsonb_array_length(p_rows);
end $$;

-- 4.4) อุปกรณ์ที่อนุมัติ (ล็อกอุปกรณ์)
create or replace function public.zz_quota_devices()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim bigint; used bigint;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    lim := public.plan_limit(new.tenant_id, 'maxDevices');
    if lim is not null and lim < 999999 then
      select count(*) into used from public.devices where tenant_id = new.tenant_id and status = 'approved' and id <> new.id;
      if used >= lim then
        perform public._quota_fail('devices', case when lim = 0 then 'แพ็กเกจนี้ยังใช้การล็อกอุปกรณ์ไม่ได้'
          else format('อนุมัติอุปกรณ์ได้สูงสุด %s เครื่อง', lim) end);
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists zz_quota_devices on public.devices;
create trigger zz_quota_devices before insert or update of status on public.devices
  for each row execute function public.zz_quota_devices();

-- 4.5) พื้นที่ไฟล์ (bucket submissions + attachments · path ขึ้นต้นด้วย tenant_id/)
--      คำนวณยอดรวมแล้วเก็บไว้ 10 นาที (ไม่ sum ทั้งตารางทุกครั้งที่อัปโหลด)
create table if not exists public.tenant_storage_usage (
  tenant_id   uuid primary key references public.tenants(id) on delete cascade,
  bytes       bigint not null default 0,
  computed_at timestamptz not null default now()
);
alter table public.tenant_storage_usage enable row level security;
revoke all on public.tenant_storage_usage from anon, authenticated;

create or replace function public.tenant_storage_bytes(p_tenant uuid, p_fresh boolean default false)
returns bigint
language plpgsql security definer set search_path = public, storage as $$
declare b bigint; at timestamptz;
begin
  if auth.uid() is not null and not (p_tenant in (select public.my_tenant_ids())) then return null; end if;
  select bytes, computed_at into b, at from public.tenant_storage_usage where tenant_id = p_tenant;
  if b is not null and not p_fresh and at > now() - interval '10 minutes' then return b; end if;
  if to_regclass('storage.objects') is null then return 0; end if;
  execute $q$
    select coalesce(sum(coalesce((metadata->>'size')::bigint, 0)), 0)
      from storage.objects
     where bucket_id in ('submissions', 'attachments') and name like $1
  $q$ into b using p_tenant::text || '/%';
  insert into public.tenant_storage_usage (tenant_id, bytes, computed_at) values (p_tenant, b, now())
    on conflict (tenant_id) do update set bytes = excluded.bytes, computed_at = excluded.computed_at;
  return b;
end $$;
revoke all on function public.tenant_storage_bytes(uuid, boolean) from public, anon;
grant execute on function public.tenant_storage_bytes(uuid, boolean) to authenticated, service_role;

create or replace function public.storage_quota_ok(p_bucket text, p_name text)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare t uuid; lim bigint;
begin
  if p_bucket not in ('submissions', 'attachments') then return true; end if;
  begin t := split_part(p_name, '/', 1)::uuid; exception when others then return true; end;
  lim := public.plan_limit(t, 'storageMb');
  if lim is null or lim >= 999999 then return true; end if;
  return coalesce(public.tenant_storage_bytes(t), 0) < lim * 1048576;
end $$;
grant execute on function public.storage_quota_ok(text, text) to authenticated;

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "krok storage quota" on storage.objects';
    execute 'create policy "krok storage quota" on storage.objects as restrictive for insert to authenticated
               with check (public.storage_quota_ok(bucket_id, name))';
  end if;
end $$;

drop trigger if exists zz_quota_submissions on public.submissions;
create trigger zz_quota_submissions before insert on public.submissions
  for each row execute function public.zz_quota_submissions();
