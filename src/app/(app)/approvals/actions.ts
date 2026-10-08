"use server";
import { sm } from "@/lib/server-msg";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";
import { dispatchWebhooks } from "@/lib/webhooks";
import { dispatchNotifications } from "@/lib/notify";
import { runLater } from "@/lib/background";
import { isRejectReasonValid, capIds, mapLimit, BULK_APPROVE_MAX, MAX_THUMBS, type BulkItemResult } from "@/lib/approval-queue";

export async function reviewSubmission(
  id: string,
  decision: "approved" | "rejected",
  note: string
): Promise<{ ok: true; advanced?: boolean } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์อนุมัติ") };
  if (typeof id !== "string" || !id) return { error: await sm("ไม่พบรายการ") };
  if (decision !== "approved" && decision !== "rejected") return { error: await sm("คำสั่งไม่ถูกต้อง") };
  note = typeof note === "string" ? note : "";
  // ตีกลับต้องมีเหตุผล (หน้าจอบังคับแล้ว แต่ server ต้องตรวจซ้ำ กันการเรียก action ตรง)
  if (decision === "rejected" && !isRejectReasonValid(note)) return { error: await sm("การตีกลับต้องระบุเหตุผล") };

  const supabase = await createClient();
  // ตรวจคิวผู้อนุมัติ + เลื่อนขั้น/ปิดงาน ทำใน RPC (ฐานข้อมูลบังคับกติกาเดียวกัน กันการยิง REST ข้ามผู้อนุมัติ)
  const { data, error } = await supabase.rpc("review_submission", { p_id: id, p_decision: decision, p_note: note.slice(0, 500) });
  if (error || !data) {
    const m = error?.message || "อนุมัติไม่สำเร็จ";
    return { error: /review_submission/.test(m) && /does not exist|schema cache|not find/i.test(m) ? "ยังไม่ได้รัน migration 0036_review_rpc.sql" : m };
  }
  const r = data as { status: "pending" | "approved" | "rejected"; step: number; advanced: boolean; form_id: string; form_title: string; tenant_id: string };
  if (r.tenant_id !== session.tenantId) return { error: await sm("ไม่พบรายการ") };
  const sub = { form_id: r.form_id, form_title: r.form_title };
  const newStatus = r.status;
  const advanced = r.advanced;
  const entry = { at: new Date().toISOString() };

  await writeAudit({
    tenant_id: session.tenantId,
    actor_id: session.userId,
    action: "submission." + decision,
    target_type: "submission",
    target_id: id,
    meta: { step: r.step, note, advanced },
  });

  // แจ้ง webhook เมื่อจบกระบวนการ (อนุมัติครบ หรือ ตีกลับ) — ไม่แจ้งตอนแค่เลื่อนขั้น
  if (newStatus === "approved" || newStatus === "rejected") {
    // best-effort: การอนุมัติ commit ไปแล้ว — webhook พังต้องไม่ทำให้ action ล้ม
    runLater(() => dispatchWebhooks(
        session.tenantId,
        newStatus === "approved" ? "submission.approved" : "submission.rejected",
        {
          submission_id: id,
          form_id: sub.form_id,
          form_title: sub.form_title,
          decision,
          reviewer_name: session.displayName,
          note: note.slice(0, 500),
          at: entry.at,
        },
        sub.form_id as string
      ));

    // แจ้งเตือน LINE/Email (best-effort)
    runLater(() => dispatchNotifications(
        session.tenantId,
        newStatus === "approved" ? "submission.approved" : "submission.rejected",
        {
          formTitle: sub.form_title as string,
          submissionId: id,
          reviewer: session.displayName,
          note: note.slice(0, 500),
        }
      ));
  }

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  return { ok: true, advanced };
}

/**
 * อนุมัติหลายใบ — เรียก reviewSubmission ทีละใบ (ทางเดียวกับปุ่มอนุมัติปกติ: สิทธิ์/ขั้นผู้อนุมัติ/MFA/audit/webhook ครบ)
 * พร้อมกันไม่เกิน 3 ใบ · สูงสุด BULK_APPROVE_MAX ใบต่อครั้ง · คืนผลรายใบ (ใบที่พลาดไม่ทำให้ใบอื่นล้ม)
 */
export async function approveMany(
  items: { id: string; note?: string }[]
): Promise<{ results: BulkItemResult[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์อนุมัติ") };
  if (!Array.isArray(items)) return { error: await sm("คำสั่งไม่ถูกต้อง") };
  if (items.length > BULK_APPROVE_MAX) return { error: await sm("เลือกได้ไม่เกิน 50 รายการต่อครั้ง") };
  const noteOf = new Map(items.map((x) => [x?.id, typeof x?.note === "string" ? x.note : ""]));
  const ids = capIds(items.map((x) => x?.id));

  const results = await mapLimit(ids, 3, async (id): Promise<BulkItemResult> => {
    try {
      const r = await reviewSubmission(id, "approved", noteOf.get(id) || "");
      return "error" in r ? { id, ok: false, error: r.error } : { id, ok: true, advanced: r.advanced };
    } catch (e) {
      return { id, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  return { results };
}

/**
 * รูปหลักฐานของใบที่กำลังแสดง — ขอ signed URL ทีละชุด (ไม่ใช่ทีละใบ)
 * ต่อหนึ่งครั้ง: ตรวจใบ 1 query + ดึง path รูป 1 query + ขอ signed URL 1 ครั้ง
 * เฉพาะใบใน workspace นี้ที่ยังรออนุมัติ และมองเห็นได้ตาม RLS ของผู้เรียก
 */
export async function loadEvidencePhotos(
  reqs: { id: string; keys: string[] }[]
): Promise<{ urls: Record<string, Record<string, string>> } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์อนุมัติ") };
  if (!Array.isArray(reqs)) return { error: await sm("คำสั่งไม่ถูกต้อง") };

  const want = new Map<string, Set<string>>();
  for (const r of reqs.slice(0, BULK_APPROVE_MAX)) {
    if (!r || typeof r.id !== "string" || !Array.isArray(r.keys)) continue;
    const ks = r.keys.filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 120).slice(0, MAX_THUMBS);
    if (ks.length) want.set(r.id, new Set(ks));
  }
  if (!want.size) return { urls: {} };

  const supabase = await createClient();
  const { data: subs } = await supabase
    .from("submissions")
    .select("id")
    .in("id", [...want.keys()])
    .eq("tenant_id", session.tenantId)
    .eq("approval_status", "pending");
  const allowed = ((subs || []) as { id: string }[]).map((s) => s.id);
  if (!allowed.length) return { urls: {} };

  const allKeys = [...new Set(allowed.flatMap((id) => [...(want.get(id) || [])]))];
  const { data: rows } = await supabase
    .from("submission_photos")
    .select("submission_id, field_id, storage_path")
    .in("submission_id", allowed)
    .in("field_id", allKeys);
  const picked = ((rows || []) as { submission_id: string; field_id: string; storage_path: string }[]).filter(
    (p) => p.storage_path && want.get(p.submission_id)?.has(p.field_id)
  );
  if (!picked.length) return { urls: {} };

  const { data: signed } = await supabase.storage.from("submissions").createSignedUrls(picked.map((p) => p.storage_path), 3600);
  const byPath = new Map<string, string>();
  for (const x of signed || []) if (x.path && x.signedUrl) byPath.set(x.path, x.signedUrl);

  const urls: Record<string, Record<string, string>> = {};
  for (const p of picked) {
    const u = byPath.get(p.storage_path);
    if (u) (urls[p.submission_id] ||= {})[p.field_id] = u;
  }
  return { urls };
}
