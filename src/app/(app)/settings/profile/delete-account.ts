"use server";
import { sm } from "@/lib/server-msg";
// ============================================================
// ลบบัญชีด้วยตัวเอง (สิทธิขอให้ลบ — PDPA ม.33) · ลบแล้วกู้คืนไม่ได้
// กติกาและขั้นตอนการลบอยู่ที่ @/lib/account-deletion (ใช้ร่วมกับหน้า Platform Admin)
// ============================================================
import { cookies } from "next/headers";
import { getSession, WS_COOKIE } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { planDeletion, executeDeletion, type DeletionPlan } from "@/lib/account-deletion";

/** ตรวจก่อนลบ — ให้หน้าจอบอกได้ว่าจะเกิดอะไรขึ้น */
export async function previewAccountDeletion(): Promise<DeletionPlan | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  const admin = getAdminClient();
  if (!admin) return { error: await sm("ระบบยังไม่พร้อมลบบัญชี (ไม่มี service role key)") };
  return planDeletion(admin, session.userId);
}

export async function deleteMyAccount(confirmEmail: string): Promise<{ ok: true } | { error: string; blockers?: DeletionPlan["blockers"] }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (confirmEmail.trim().toLowerCase() !== session.email.toLowerCase()) return { error: await sm("อีเมลยืนยันไม่ตรงกับบัญชี") };
  const admin = getAdminClient();
  if (!admin) return { error: await sm("ระบบยังไม่พร้อมลบบัญชี (ไม่มี service role key)") };

  const res = await executeDeletion(admin, { userId: session.userId, email: session.email }, { actorId: session.userId, by: "self" });
  if ("error" in res) return res;

  try { await (await createClient()).auth.signOut(); } catch { /* ผู้ใช้ถูกลบแล้ว token ใช้ไม่ได้อยู่ดี */ }
  (await cookies()).delete(WS_COOKIE);
  return { ok: true };
}
