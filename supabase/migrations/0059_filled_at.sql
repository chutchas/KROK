-- ============================================================
-- KROK · 0059_filled_at
-- เวลาที่กรอกจริง (เวลาที่ผู้ใช้กดส่งบนเครื่อง) แยกจาก submitted_at (เวลาที่ server ได้รับ)
-- ใบที่กรอกตอนออฟไลน์แล้ว sync ทีหลัง: submitted_at = ตอน sync, filled_at = ตอนกรอกจริง
-- server รับเฉพาะเวลาที่สมเหตุสมผล (ย้อนหลังไม่เกิน 7 วัน และไม่เกินเวลาปัจจุบัน) — นอกช่วง = null
-- การกรอง/เรียง/โควตารายเดือนยังใช้ submitted_at (เวลาของ server — ปลอมไม่ได้)
-- รันซ้ำได้ · ต้องรันหลัง 0058
-- ============================================================

alter table public.submissions add column if not exists filled_at timestamptz;

-- ด่านซ้ำใน DB: ค่าที่หลุดช่วง (เช่นสิทธิ์ insert ถูกคืนในอนาคต) → ตัดทิ้ง
create or replace function public.zz_clamp_filled_at()
returns trigger
language plpgsql
as $$
begin
  if new.filled_at is not null and (new.filled_at > now() + interval '2 minutes' or new.filled_at < now() - interval '7 days') then
    new.filled_at := null;
  end if;
  if new.filled_at is not null and new.filled_at > now() then
    new.filled_at := now();
  end if;
  return new;
end $$;

drop trigger if exists zz_clamp_filled_at on public.submissions;
create trigger zz_clamp_filled_at before insert on public.submissions
  for each row execute function public.zz_clamp_filled_at();
