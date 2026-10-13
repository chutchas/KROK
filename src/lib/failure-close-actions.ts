"use server";
import { revalidatePath } from "next/cache";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { getSession, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// ปิดเรื่อง / เปิดเรื่องกลับ ของใบไม่ผ่าน (0080) — ฐานข้อมูลตรวจสิทธิ์ซ้ำ (close_submission_failure / reopen_submission_failure)
// ปิด: ผู้จัดการ (owner/admin/designer) + หมายเหตุว่าแก้อย่างไร · เปิดกลับ: owner/admin · บันทึก audit_log ทุกครั้ง

type R = { ok: true } | { error: string };

async function rpcMsg(e: { message?: string; code?: string }): Promise<string> {
  const m = e.message || "";
  // ยังไม่รัน 0080 = ไม่มีฟังก์ชัน
  if (e.code === "PGRST202" || /close_submission_failure|reopen_submission_failure/.test(m)) return sm("ระบบยังไม่พร้อมปิดเรื่อง (ผู้ดูแลต้องรัน migration 0080)");
  if (/mfa required/i.test(m)) return sm("ต้องยืนยันตัวตนสองขั้น (2FA) ก่อนจึงจะทำรายการนี้ได้");
  if (/unauthorized/i.test(m)) return sm("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  if (/[฀-๿]/.test(m) && m.length < 200) return sm(m);
  return sm(dbError(e));
}

function refresh(id: string) {
  revalidatePath(`/submission/${id}`);
  revalidatePath("/dashboard");
}

export async function closeFailure(id: string, note: string): Promise<R> {
  const session = await getSession();
  if (!session) return { error: await sm("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่") };
  if (!canManage(session.role)) return { error: await sm("เฉพาะผู้จัดการ workspace ที่ปิดเรื่องได้") };
  const n = String(note || "").trim();
  if (n.length < 3) return { error: await sm("กรุณาระบุว่าแก้ไขอย่างไร") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_submission_failure", { p_id: id, p_note: n.slice(0, 1000) });
  if (error) return { error: await rpcMsg(error) };
  refresh(id);
  return { ok: true };
}

export async function reopenFailure(id: string, reason: string): Promise<R> {
  const session = await getSession();
  if (!session) return { error: await sm("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่") };
  if (session.role !== "owner" && session.role !== "admin") return { error: await sm("เฉพาะเจ้าของหรือผู้ดูแล workspace ที่เปิดเรื่องกลับได้") };
  const r = String(reason || "").trim();
  if (r.length < 3) return { error: await sm("กรุณาระบุเหตุผลที่เปิดเรื่องกลับ") };
  const supabase = await createClient();
  let { error } = await supabase.rpc("reopen_submission_failure", { p_id: id, p_reason: r.slice(0, 500) });
  // ยังไม่รัน 0081 (ยังเป็นตัวเดิมที่ไม่มีเหตุผล) → เรียกแบบเดิม เหตุผลไม่ถูกบันทึก
  if (error && (error.code === "PGRST202" || /reopen_submission_failure/.test(error.message || ""))) {
    ({ error } = await supabase.rpc("reopen_submission_failure", { p_id: id }));
  }
  if (error) return { error: await rpcMsg(error) };
  refresh(id);
  return { ok: true };
}
