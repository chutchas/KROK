import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * ห่อ handler ของงานตั้งเวลา: บันทึกผลรอบล่าสุดลง cron_runs (0058) ให้หน้า Health เห็นว่างานยังรันอยู่ไหม
 * คำขอที่ไม่ผ่านการยืนยัน (401) ไม่บันทึก · บันทึกไม่ได้ = ข้าม ไม่กระทบงาน
 */
export function withCronLog(job: string, handle: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    let res: Response;
    try {
      res = await handle(req);
    } catch (e) {
      await save(job, false, e instanceof Error ? e.message : String(e));
      throw e;
    }
    if (res.status !== 401) {
      let note = "";
      try { note = JSON.stringify(await res.clone().json()); } catch { /* ไม่ใช่ JSON */ }
      await save(job, res.ok, note);
    }
    return res;
  };
}

async function save(job: string, ok: boolean, note: string) {
  const admin = getAdminClient();
  if (!admin) return;
  try {
    await admin.from("cron_runs").upsert({ job, last_at: new Date().toISOString(), ok, note: note.slice(0, 500) });
  } catch { /* best-effort */ }
}
