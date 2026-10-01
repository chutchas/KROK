import "server-only";
// ============================================================
// KROK · API รับข้อมูลเข้า — ส่วนที่ต้องใช้ service role (สร้างเอกสาร / เปิดงาน)
// ============================================================
import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormSchema } from "@/lib/form-schema";
import { buildAnswerList, titleFromAnswers, type IntakeAnswer } from "@/lib/intake";
import { stepTeam, stepUser } from "@/lib/case-flow";
import { dispatchWebhooks } from "@/lib/webhooks";
import { dispatchNotifications } from "@/lib/notify";
import { runLater } from "@/lib/background";

type Db = SupabaseClient;

export function hashIntakeKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function newIntakeKey(): { key: string; prefix: string; hash: string } {
  const key = "kfi_" + randomBytes(24).toString("base64url");
  return { key, prefix: key.slice(0, 9), hash: hashIntakeKey(key) };
}

export interface IntakeForm {
  id: string;
  tenant_id: string;
  title: string;
  icon: string;
  version: number;
  requires_approval: boolean;
  approval_chain: unknown[];
  /** schema ตามที่เก็บใน DB (ใช้เป็นสำเนาของงาน) */
  rawSchema: unknown;
}

/** สร้างเอกสาร (submission) จากค่าที่ส่งมาครบ */
export async function createIntakeSubmission(
  admin: Db,
  f: IntakeForm,
  schema: FormSchema,
  answers: Record<string, IntakeAnswer>,
  opts: { ref: string | null; sourceName: string }
): Promise<{ id: string } | { error: string; duplicate?: boolean }> {
  const { list, fails } = buildAnswerList(schema, answers);
  const result: "pass" | "fail" = fails.length ? "fail" : "pass";
  const id = crypto.randomUUID();
  const { error } = await admin.from("submissions").insert({
    id,
    tenant_id: f.tenant_id,
    form_id: f.id,
    form_title: f.title,
    form_icon: f.icon,
    form_version: f.version,
    submitted_by: null,
    user_name: opts.sourceName,
    result,
    fails,
    answers: list,
    duration_s: 0,
    approval_status: f.requires_approval ? "pending" : "none",
    approval_chain: f.requires_approval ? f.approval_chain : [],
    approval_step: 0,
    approval_history: [],
    ext_ref: opts.ref,
    source: "api",
  });
  if (error) return error.code === "23505" ? { error: "duplicate", duplicate: true } : { error: error.message };

  await admin.from("audit_log").insert({
    tenant_id: f.tenant_id,
    actor_id: null,
    action: "submission.create",
    target_type: "form",
    target_id: f.id,
    meta: { submission_id: id, result, source: "api", ref: opts.ref, source_name: opts.sourceName },
  });
  runLater(() => dispatchWebhooks(f.tenant_id, "submission.created", {
      submission_id: id, form_id: f.id, form_title: f.title, user_name: opts.sourceName, result, fails, answers: list,
      approval_status: f.requires_approval ? "pending" : "none", submitted_at: new Date().toISOString(), source: "api", ref: opts.ref,
    }, f.id));
  runLater(() => dispatchNotifications(f.tenant_id, "submission.created", {
      formTitle: f.title, formIcon: f.icon, userName: opts.sourceName, result, failCount: fails.length, submissionId: id,
    }));
  return { id };
}

/**
 * เปิดงานพร้อมค่าที่เติมไว้ ให้คนกรอกช่องที่เหลือต่อ
 * ผู้รับ: ตั้งในแท็บ API → ถ้าไม่ตั้ง ใช้ผู้รับผิดชอบขั้นแรกของฟอร์ม → ไม่มีเลย = ผู้ดูแล (กองงานไม่มีทีม)
 */
export async function createIntakeCase(
  admin: Db,
  f: IntakeForm,
  schema: FormSchema,
  answers: Record<string, IntakeAnswer>,
  opts: { ref: string | null; sourceName: string; assignee: { team_id?: string; user_id?: string } | null }
): Promise<{ id: string; holder: string | null; team: string | null } | { error: string; duplicate?: boolean }> {
  let teamId = opts.assignee?.team_id ?? stepTeam(schema, 0);
  let userId = opts.assignee?.user_id ?? (opts.assignee?.team_id ? null : stepUser(schema, 0));
  if (opts.assignee?.team_id) userId = null;

  // ทีม/คนต้องอยู่ใน workspace นี้จริง
  if (teamId) {
    const { data: t } = await admin.from("teams").select("id").eq("id", teamId).eq("tenant_id", f.tenant_id).maybeSingle();
    if (!t) teamId = null;
  }
  let holderName: string | null = null;
  if (userId) {
    const { data: m } = await admin.from("memberships").select("name, email").eq("tenant_id", f.tenant_id).eq("user_id", userId).maybeSingle();
    if (!m) userId = null;
    else holderName = (m.name as string) || (m.email as string) || "สมาชิก";
  }

  let filled = 0, total = 0;
  for (const st of schema.steps)
    for (const fl of st.fields) {
      total++;
      const v = answers[fl.id]?.value;
      if (Array.isArray(v) ? v.length : v != null && v !== "") filled++;
    }

  const now = new Date().toISOString();
  const title = titleFromAnswers(schema, answers);
  const label = `API · ${opts.sourceName}`;
  const { data, error } = await admin.from("form_cases").insert({
    tenant_id: f.tenant_id,
    form_id: f.id,
    form_version: f.version,
    form_title: f.title,
    form_icon: f.icon,
    schema: f.rawSchema,
    title,
    step_idx: 0,
    assignee_team: userId ? null : teamId,
    claimed_by: userId,
    claimed_name: holderName,
    claimed_at: userId ? now : null,
    answers,
    history: [{ action: "start", step: 0, by: null, name: label, at: now, note: opts.ref ? `ref: ${opts.ref}` : null }],
    participants: [],
    created_by: null,
    created_name: label,
    filled,
    total,
    ext_ref: opts.ref,
  }).select("id").single();
  if (error || !data) return error?.code === "23505" ? { error: "duplicate", duplicate: true } : { error: error?.message || "เปิดงานไม่สำเร็จ" };
  const id = data.id as string;

  try {
    await admin.rpc("case_notify_next", {
      p_case: id,
      p_type: "case_assigned",
      p_title: `${userId ? "งานส่งถึงคุณ" : "งานรอรับ"}: ${f.title}`,
      p_body: `${opts.sourceName} ส่งข้อมูลเข้ามา — กรอกช่องที่เหลือต่อ${title ? ` · ${title}` : ""}`,
    });
  } catch { /* best-effort */ }

  let teamName: string | null = null;
  if (!userId && teamId) {
    const { data: t } = await admin.from("teams").select("name").eq("id", teamId).maybeSingle();
    teamName = (t?.name as string) ?? null;
  }
  runLater(() => dispatchNotifications(f.tenant_id, "case.assigned", {
      formTitle: f.title, formIcon: f.icon, userName: label, submissionId: id,
      caseTitle: title || undefined, stepTitle: `1. ${schema.steps[0]?.title ?? ""}`,
      teamName: teamName ?? undefined, assignee: holderName ?? undefined,
    }));
  return { id, holder: holderName, team: teamName };
}
