"use server";
import { revalidatePath } from "next/cache";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { getSession, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendWorkspaceEmailTo } from "@/lib/notify";
import { runLater } from "@/lib/background";
import { siteOrigin } from "@/lib/site-origin";

// ปิดเรื่อง / เปิดเรื่องกลับ ของใบไม่ผ่าน (0080) — ฐานข้อมูลตรวจสิทธิ์ซ้ำ (close_submission_failure / reopen_submission_failure)
// ปิด: ผู้จัดการ (เจ้าของ/แอดมิน/ออกแบบฟอร์ม) + หมายเหตุว่าแก้อย่างไร · เปิดกลับ: เจ้าของ/แอดมิน · บันทึก audit_log ทุกครั้ง

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

/**
 * แจ้งในกระดิ่งของ workspace (notifications) + อีเมลถึงคนเดียวกันผ่าน SMTP ของ workspace (ถ้าตั้งไว้)
 * ปิดเรื่อง: คนกรอก · เปิดกลับ: คนกรอก + คนที่ปิดไว้ · ไม่แจ้งตัวเอง · best-effort (แจ้งไม่ได้ไม่ทำให้การปิด/เปิดล้ม) · LINE ยังไม่ส่ง
 */
async function notifyFailure(id: string, kind: "close" | "reopen", actorId: string, text: string, prevCloserId: string | null) {
  try {
    const admin = getAdminClient();
    if (!admin) return;
    const { data: s } = await admin.from("submissions").select("tenant_id, submitted_by, form_title, doc_no").eq("id", id).maybeSingle();
    if (!s) return;
    const to = Array.from(new Set([s.submitted_by as string | null, kind === "reopen" ? prevCloserId : null]))
      .filter((u): u is string => !!u && u !== actorId);
    if (!to.length) return;
    const doc = [s.form_title, s.doc_no].filter(Boolean).join(" · ");
    const t = text.length > 140 ? `${text.slice(0, 140)}…` : text;
    // อีเมล: อ่านจากสมาชิกภาพของ workspace นี้ · ส่งหลังตอบผู้ใช้แล้ว (SMTP ช้าได้ถึง 15 วินาที)
    const { data: mem } = await admin.from("memberships").select("user_id, email").eq("tenant_id", s.tenant_id).in("user_id", to);
    const emails = ((mem || []) as { email: string | null }[]).map((m) => m.email || "").filter(Boolean);
    if (emails.length) {
      // ลิงก์จาก URL ของเว็บที่ตั้งค่าไว้ (ไม่เชื่อ Host ของคำขอ — กันลิงก์ปลอมในอีเมล)
      const url = `${await siteOrigin()}/submission/${id}`;
      const head = kind === "close" ? "ปิดเรื่องแล้ว" : "เปิดเรื่องกลับ";
      const body = [
        head,
        `เอกสาร: ${doc}`,
        kind === "close" ? `การแก้ไข: ${text}` : `เหตุผล: ${text}`,
        url,
      ].filter(Boolean).join("\n");
      const tenantId = s.tenant_id as string;
      runLater(() => sendWorkspaceEmailTo(tenantId, emails, `${head} — ${doc}`, body));
    }
    await admin.from("notifications").insert(to.map((uid) => ({
      tenant_id: s.tenant_id,
      user_id: uid,
      type: kind === "close" ? "fail_closed" : "fail_reopened",
      title: kind === "close" ? `ปิดเรื่องแล้ว: ${doc}` : `เปิดเรื่องกลับ: ${doc}`,
      body: kind === "close" ? `การแก้ไข: ${t}` : `เหตุผล: ${t}`,
      link: `/submission/${id}`,
      submission_id: id,
    })));
  } catch {
    /* best-effort */
  }
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
  await notifyFailure(id, "close", session.userId, n, null);
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
  // คนที่ปิดไว้ — อ่านก่อนเปิดกลับ (เปิดกลับแล้วคอลัมน์ถูกล้าง)
  const { data: before } = await supabase.from("submissions").select("fail_closed_by").eq("id", id).maybeSingle();
  let { error } = await supabase.rpc("reopen_submission_failure", { p_id: id, p_reason: r.slice(0, 500) });
  // ยังไม่รัน 0081 (ยังเป็นตัวเดิมที่ไม่มีเหตุผล) → เรียกแบบเดิม เหตุผลไม่ถูกบันทึก
  if (error && (error.code === "PGRST202" || /reopen_submission_failure/.test(error.message || ""))) {
    ({ error } = await supabase.rpc("reopen_submission_failure", { p_id: id }));
  }
  if (error) return { error: await rpcMsg(error) };
  await notifyFailure(id, "reopen", session.userId, r, (before?.fail_closed_by as string | null) ?? null);
  refresh(id);
  return { ok: true };
}
