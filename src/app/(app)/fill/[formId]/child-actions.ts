"use server";
// ฟอร์มลูก (0074): กดปุ่มเปิดฟอร์มลูกจากใบงานหลัก · รายการฟอร์มลูกของใบงาน
// สิทธิ์ทั้งหมดตรวจใน DB (child_form_open / RLS ของ form_child_links)
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { rateLimited } from "@/lib/rate-limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = (m: string) => /child_form_open|form_child_links|child_buttons/.test(m) && /does not exist|not find|schema cache/i.test(m);

export interface ChildLink {
  id: string;
  parent_field_id: string;
  child_form_id: string | null;
  child_form_title: string;
  child_case_id: string | null;
  child_submission_id: string | null;
  status: "pending" | "done" | "cancelled";
  cancel_reason: string | null;
  writeback_status: "pending" | "ok" | "failed";
  writeback_error: string | null;
  created_name: string | null;
  created_at: string;
  done_at: string | null;
}

export async function openChildForm(parentCaseId: string, fieldId: string): Promise<{ ok: true; childCaseId: string; childFormId: string; mine: boolean } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!UUID.test(parentCaseId) || !/^[\w-]{1,40}$/.test(fieldId)) return { error: "bad request" };
  if (await rateLimited(`child-open:${session.userId}`, 20, 60)) return { error: await sm("กดถี่เกินไป — รอสักครู่แล้วลองใหม่") };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("child_form_open", { p_parent: parentCaseId, p_field: fieldId });
  if (error) return { error: missing(error.message || "") ? await sm("ฟีเจอร์นี้ยังไม่พร้อมใช้งานในระบบ — ติดต่อผู้ดูแลระบบ KROK") : await sm(dbError(error)) };
  const r = (data || {}) as { child_case_id?: string; child_form_id?: string; mine?: boolean };
  if (!r.child_case_id || !r.child_form_id) return { error: await sm("เปิดฟอร์มลูกไม่สำเร็จ") };
  return { ok: true, childCaseId: r.child_case_id, childFormId: r.child_form_id, mine: !!r.mine };
}

/** ฟอร์มลูกของใบงานนี้ (เห็นตามสิทธิ์ของงาน) */
export async function listChildLinks(parentCaseId: string): Promise<ChildLink[]> {
  const session = await getSession();
  if (!session || !UUID.test(parentCaseId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_child_links")
    .select("id, parent_field_id, child_form_id, child_form_title, child_case_id, child_submission_id, status, cancel_reason, writeback_status, writeback_error, created_name, created_at, done_at")
    .eq("parent_case_id", parentCaseId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data || []) as ChildLink[];
}
