"use server";
import { revalidatePath } from "next/cache";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { writeAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { getSession, canManage } from "@/lib/session";
import { normalizeSchedule, type ScheduleConfig } from "@/lib/schedule";
import { loadFormSchedule, scheduleToRow } from "@/lib/schedule-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === "string" && UUID_RE.test(s)))].slice(0, 500) : []);

/** ตารางรอบตรวจของฟอร์ม · null = ยังไม่ตั้ง · missing = ยังไม่รัน 0064 */
export async function getFormSchedule(formId: string): Promise<{ schedule: ScheduleConfig | null; missing?: boolean } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์") };
  if (!UUID_RE.test(formId)) return { error: await sm("ไม่พบฟอร์ม") };
  const supabase = await createClient();
  const r = await loadFormSchedule(supabase, formId);
  if (r === "missing") return { schedule: null, missing: true };
  return { schedule: r };
}

export async function saveFormSchedule(raw: ScheduleConfig): Promise<{ ok: true; schedule: ScheduleConfig } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์") };
  if (!raw || typeof raw !== "object" || !UUID_RE.test(String(raw.formId))) return { error: await sm("ไม่พบฟอร์ม") };

  const cleaned = normalizeSchedule({
    formId: String(raw.formId),
    enabled: raw.enabled !== false,
    freq: raw.freq,
    days: Array.isArray(raw.days) ? raw.days.map(Number) : [],
    times: Array.isArray(raw.times) ? raw.times.map(String) : [],
    windowMin: Number(raw.windowMin),
    assignTeams: ids(raw.assignTeams),
    assignUsers: ids(raw.assignUsers),
    mode: raw.mode,
    notifyStart: raw.notifyStart !== false,
    notifyOverdue: raw.notifyOverdue !== false,
    escalateUsers: ids(raw.escalateUsers),
  });
  if ("error" in cleaned) return { error: await sm(cleaned.error) };

  const supabase = await createClient();
  const { data: form } = await supabase.from("forms").select("id").eq("id", cleaned.value.formId).eq("tenant_id", session.tenantId).is("deleted_at", null).maybeSingle();
  if (!form) return { error: await sm("ไม่พบฟอร์ม") };

  const { error } = await supabase.from("form_schedules").upsert(scheduleToRow(cleaned.value, session.tenantId));
  if (error) return { error: await sm(dbError(error)) };

  await writeAudit({
    tenant_id: session.tenantId, actor_id: session.userId, action: "form.schedule", target_type: "form", target_id: cleaned.value.formId,
    meta: { freq: cleaned.value.freq, times: cleaned.value.times, mode: cleaned.value.mode, enabled: cleaned.value.enabled },
  });
  revalidatePath("/forms");
  revalidatePath("/dashboard");
  return { ok: true, schedule: cleaned.value };
}

export async function deleteFormSchedule(formId: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์") };
  if (!UUID_RE.test(formId)) return { error: await sm("ไม่พบฟอร์ม") };
  const supabase = await createClient();
  const { error } = await supabase.from("form_schedules").delete().eq("form_id", formId).eq("tenant_id", session.tenantId);
  if (error) return { error: await sm(dbError(error)) };
  await writeAudit({ tenant_id: session.tenantId, actor_id: session.userId, action: "form.schedule_off", target_type: "form", target_id: formId, meta: {} });
  revalidatePath("/forms");
  revalidatePath("/dashboard");
  return { ok: true };
}
