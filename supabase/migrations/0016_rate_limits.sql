-- ============================================================
-- KROK · 0016_rate_limits
-- Rate limiting แบบ atomic บน Postgres (ใช้ได้ข้าม serverless instance)
-- ใช้กับ endpoint สาธารณะ เช่น /api/public/submit เพื่อกันสแปม/DoS ต่อ IP
-- เรียกผ่าน service role เท่านั้น (ไม่เปิดให้ anon/authenticated)
-- ============================================================

create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        int not null default 0
);

-- เปิด RLS แต่ไม่มี policy = ปฏิเสธทุก role ปกติ (เข้าถึงได้เฉพาะ service role ที่ bypass RLS)
alter table public.rate_limits enable row level security;

-- ฟังก์ชัน atomic: เพิ่มตัวนับของ key ภายในหน้าต่างเวลา แล้วบอกว่า "ยังผ่านได้ไหม"
-- คืน true ถ้ายังไม่เกิน p_max ในหน้าต่าง p_window_seconds วินาที, false ถ้าเกิน
create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public as $$
declare
  cur_count int;
  cur_start timestamptz;
begin
  insert into public.rate_limits as r (key, window_start, count)
    values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
          when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else r.count + 1 end,
        window_start = case
          when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else r.window_start end
  returning r.count, r.window_start into cur_count, cur_start;

  -- เก็บกวาดแถวเก่าแบบสุ่ม (ประมาณ 1%) เพื่อไม่ให้ตารางโตไม่จำกัด
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return cur_count <= p_max;
end $$;

-- อนุญาตเฉพาะ service role (ถอนสิทธิ์เรียกจาก role อื่น)
revoke all on function public.hit_rate_limit(text, int, int) from public;
do $$ begin
  begin revoke all on function public.hit_rate_limit(text, int, int) from anon; exception when others then null; end;
  begin revoke all on function public.hit_rate_limit(text, int, int) from authenticated; exception when others then null; end;
end $$;
