"use server";
// งาน (ฟอร์มกรอกหลายคน) — เรียก RPC ด้วยสิทธิ์ของผู้ใช้ (ตรวจสิทธิ์ใน DB) แล้วส่ง LINE/Email ต่อ
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { dispatchNotifications } from "@/lib/notify";
import type { FormSchema } from "@/lib/form-schema";

type Res = { ok: true; teamName?: string | null; holder?: string | null } | { error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CaseRow {
  id: string;
  tenant_id: string;
  form_id: string;
  form_title: string;
  form_icon: string;
  title: string;
  schema: FormSchema;
  step_idx: number;
  assignee_team: string | null;
  claimed_name: string | null;
  media: Record<string, string> | null;
  doc_extracts: { path?: string | null }[] | null;
}

function errMsg(e: { message?: string } | null): string {
  const m = e?.message || "ทำรายการไม่สำเร็จ";
  // ยังไม่ได้รัน migration 0033
  if (/case_\w+|form_cases/.test(m) && /does not exist|not find|schema cache/i.test(m)) return "ยังไม่ได้เปิดใช้ฟอร์มกรอกหลายคน (ต้องรัน migration 0033)";
  return m;
}

async function teamName(supabase: Awaited<ReturnType<typeof createClient>>, id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await supabase.from("teams").select("name").eq("id", id).maybeSingle();
  return (data?.name as string) ?? null;
}

function stepTitle(schema: FormSchema, i: number): string {
  return schema.steps?.[i]?.title || `ขั้นตอนที่ ${i + 1}`;
}

async function afterMove(row: CaseRow, ev: "case.assigned" | "case.returned", actor: string, note: string | null, supabase: Awaited<ReturnType<typeof createClient>>): Promise<Res> {
  const tn = await teamName(supabase, row.assignee_team);
  try {
    await dispatchNotifications(row.tenant_id, ev, {
      formTitle: row.form_title,
      formIcon: row.form_icon,
      userName: actor,
      submissionId: row.id,
      caseTitle: row.title || undefined,
      stepTitle: `${row.step_idx + 1}. ${stepTitle(row.schema, row.step_idx)}`,
      teamName: row.claimed_name ? undefined : tn ?? undefined,
      assignee: row.claimed_name ?? undefined,
      note: note || undefined,
    });
  } catch { /* best-effort */ }
  revalidatePath("/forms");
  return { ok: true, teamName: tn, holder: row.claimed_name };
}

export async function advanceCaseAction(caseId: string, note: string | null): Promise<Res> {
  const session = await getSession();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };
  if (!UUID.test(caseId)) return { error: "ไม่พบงาน" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("case_advance", { p_case: caseId, p_note: note?.slice(0, 500) || null });
  if (error || !data) return { error: errMsg(error) };
  return afterMove(data as CaseRow, "case.assigned", session.displayName, note, supabase);
}

export async function returnCaseAction(caseId: string, toStep: number, note: string): Promise<Res> {
  const session = await getSession();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };
  if (!UUID.test(caseId) || !Number.isInteger(toStep)) return { error: "ไม่พบงาน" };
  if (!note.trim()) return { error: "ต้องระบุเหตุผลที่ส่งกลับ" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("case_return", { p_case: caseId, p_to: toStep, p_note: note.slice(0, 500) });
  if (error || !data) return { error: errMsg(error) };
  return afterMove(data as CaseRow, "case.returned", session.displayName, note, supabase);
}

export async function claimCaseAction(caseId: string): Promise<Res> {
  const session = await getSession();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };
  if (!UUID.test(caseId)) return { error: "ไม่พบงาน" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("case_claim", { p_case: caseId });
  if (error) return { error: errMsg(error) };
  revalidatePath("/forms");
  return { ok: true };
}

export async function releaseCaseAction(caseId: string): Promise<Res> {
  const session = await getSession();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };
  if (!UUID.test(caseId)) return { error: "ไม่พบงาน" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("case_release", { p_case: caseId });
  if (error || !data) return { error: errMsg(error) };
  return afterMove(data as CaseRow, "case.assigned", session.displayName, null, supabase);
}

/** ลบไฟล์ของงานใน bucket 'cases' (หลังงานปิด — รูปถูกคัดลอกไปกับ submission แล้ว) */
async function purgeCaseFiles(row: Pick<CaseRow, "media" | "doc_extracts">) {
  const admin = getAdminClient();
  if (!admin) return;
  const paths = [
    ...Object.values(row.media || {}),
    ...(row.doc_extracts || []).map((d) => d.path).filter((p): p is string => !!p),
  ];
  if (paths.length) {
    try { await admin.storage.from("cases").remove(paths); } catch { /* ไฟล์ค้างไม่กระทบการทำงาน */ }
  }
}

export async function cancelCaseAction(caseId: string, note: string | null): Promise<Res> {
  const session = await getSession();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };
  if (!UUID.test(caseId)) return { error: "ไม่พบงาน" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("case_cancel", { p_case: caseId, p_note: note?.slice(0, 500) || null });
  if (error || !data) return { error: errMsg(error) };
  await purgeCaseFiles(data as CaseRow);
  revalidatePath("/forms");
  return { ok: true };
}

/** ขั้นสุดท้าย: หลัง insert submission สำเร็จ → ปิดงาน */
export async function completeCaseAction(caseId: string, submissionId: string): Promise<Res> {
  const session = await getSession();
  if (!session) return { error: "กรุณาเข้าสู่ระบบ" };
  if (!UUID.test(caseId) || !UUID.test(submissionId)) return { error: "ไม่พบงาน" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("case_complete", { p_case: caseId, p_submission: submissionId });
  if (error || !data) return { error: errMsg(error) };
  await purgeCaseFiles(data as CaseRow);
  revalidatePath("/forms");
  return { ok: true };
}
