"use server";
import { revalidatePath } from "next/cache";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// ลบเอกสารแบบซ่อน / กู้คืน — owner/admin เท่านั้น (ตรวจซ้ำในฐานข้อมูล: delete_submission / restore_submission · 0079)
// เหตุผลการลบบันทึกไว้ในเอกสาร + audit_log · กู้คืนได้ภายใน 30 วัน แล้ว cron cleanup ลบจริงพร้อมรูป

type R = { ok: true } | { error: string };

async function guard(): Promise<{ error: string } | null> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (session.role !== "owner" && session.role !== "admin") return { error: await sm("เฉพาะเจ้าของหรือผู้ดูแล workspace ที่ลบเอกสารได้") };
  return null;
}

/** ข้อความจากฐานข้อมูลที่ตั้งใจให้ผู้ใช้เห็น (raise exception ภาษาไทย) — อย่างอื่นใช้ข้อความกลาง */
async function rpcMsg(e: { message?: string; code?: string }): Promise<string> {
  const m = e.message || "";
  if (/[฀-๿]/.test(m) && m.length < 200) return sm(m);
  return sm(dbError(e));
}

export async function deleteSubmission(id: string, reason: string): Promise<R> {
  const g = await guard();
  if (g) return g;
  const r = String(reason || "").trim();
  if (r.length < 3) return { error: await sm("กรุณาระบุเหตุผลที่ลบ") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_submission", { p_id: id, p_reason: r.slice(0, 500) });
  if (error) return { error: await rpcMsg(error) };
  revalidatePath("/dashboard");
  revalidatePath("/reports/trash");
  return { ok: true };
}

export async function restoreSubmission(id: string): Promise<R> {
  const g = await guard();
  if (g) return g;
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_submission", { p_id: id });
  if (error) return { error: await rpcMsg(error) };
  revalidatePath("/reports/trash");
  revalidatePath("/dashboard");
  return { ok: true };
}
