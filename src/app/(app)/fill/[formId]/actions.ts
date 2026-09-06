"use server";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { dispatchWebhooks } from "@/lib/webhooks";

/**
 * แจ้ง webhook ว่ามี submission ใหม่ (เรียกหลังบันทึกสำเร็จจากฝั่ง client)
 * โหลด submission ด้วย client ของผู้ใช้ (RLS การันตีว่าเป็นของ tenant ตัวเอง)
 */
export async function notifySubmission(submissionId: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };

  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, tenant_id, form_id, form_title, user_name, result, fails, answers, approval_status, submitted_at")
    .eq("id", submissionId)
    .maybeSingle();

  if (!sub || sub.tenant_id !== session.tenantId) return { ok: false };

  await dispatchWebhooks(session.tenantId, "submission.created", {
    submission_id: sub.id,
    form_id: sub.form_id,
    form_title: sub.form_title,
    user_name: sub.user_name,
    result: sub.result,
    fails: sub.fails,
    answers: sub.answers,
    approval_status: sub.approval_status,
    submitted_at: sub.submitted_at,
  }, sub.form_id as string);
  return { ok: true };
}
