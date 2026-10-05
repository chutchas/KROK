import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bkkDayStart, compliance, evaluateRounds, expandRounds, userStatus, EARLY_MIN,
  type Completion, type ComplianceStat, type RoundStatus, type ScheduleConfig, type ScheduleFreq,
} from "@/lib/schedule";

// ============================================================
// อ่านตารางรอบตรวจ (0064) + ใบที่ส่ง → รอบวันนี้ / สรุปความครบถ้วน
// ใช้ client ของผู้ใช้ (RLS): ตาราง = สมาชิก workspace เห็น · ใบที่ส่ง = ฟอร์มที่ตัวเองเห็น
// ============================================================

const DAY = 86400_000;

export function rowToSchedule(r: Record<string, unknown>): ScheduleConfig {
  const ids = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
  return {
    formId: r.form_id as string,
    enabled: r.enabled !== false,
    freq: (r.freq as ScheduleFreq) || "daily",
    days: Array.isArray(r.days) ? (r.days as number[]).map(Number) : [],
    times: Array.isArray(r.times) ? (r.times as string[]) : ["08:00"],
    windowMin: Number(r.window_min) || 120,
    assignTeams: ids(r.assign_teams),
    assignUsers: ids(r.assign_users),
    mode: r.mode === "each" ? "each" : "once",
    notifyStart: r.notify_start !== false,
    notifyOverdue: r.notify_overdue !== false,
    escalateUsers: ids(r.escalate_users),
  };
}

export function scheduleToRow(c: ScheduleConfig, tenantId: string) {
  return {
    form_id: c.formId, tenant_id: tenantId, enabled: c.enabled, freq: c.freq, days: c.days, times: c.times,
    window_min: c.windowMin, assign_teams: c.assignTeams, assign_users: c.assignUsers, mode: c.mode,
    notify_start: c.notifyStart, notify_overdue: c.notifyOverdue, escalate_users: c.escalateUsers,
  };
}

interface Ctx {
  schedules: (ScheduleConfig & { title: string; icon: string })[];
  teamMembers: Map<string, string[]>;
  memberIds: Set<string>;
  names: Map<string, string>;
}

/** ตาราง (เปิดอยู่ ของฟอร์มที่เผยแพร่) + สมาชิกทีม · ยังไม่รัน 0064 = null */
async function loadCtx(supabase: SupabaseClient, tenantId: string, formIds?: string[]): Promise<Ctx | null> {
  let q = supabase
    .from("form_schedules")
    .select("*, forms!inner(title, icon, status, deleted_at)")
    .eq("tenant_id", tenantId)
    .eq("enabled", true)
    .eq("forms.status", "published")
    .is("forms.deleted_at", null);
  if (formIds) q = q.in("form_id", formIds);
  const [sq, tq, mq] = await Promise.all([
    q,
    supabase.from("team_members").select("team_id, user_id").eq("tenant_id", tenantId),
    supabase.from("memberships").select("user_id, name, email").eq("tenant_id", tenantId),
  ]);
  if (sq.error) return null;
  const teamMembers = new Map<string, string[]>();
  for (const r of (tq.data || []) as { team_id: string; user_id: string }[]) {
    const a = teamMembers.get(r.team_id) ?? [];
    a.push(r.user_id);
    teamMembers.set(r.team_id, a);
  }
  const names = new Map<string, string>();
  const memberIds = new Set<string>();
  for (const r of (mq.data || []) as { user_id: string; name: string | null; email: string | null }[]) {
    names.set(r.user_id, r.name || r.email || "สมาชิก");
    memberIds.add(r.user_id);
  }
  const schedules = ((sq.data || []) as Record<string, unknown>[]).map((r) => {
    const f = (Array.isArray(r.forms) ? r.forms[0] : r.forms) as { title?: string; icon?: string } | null;
    return { ...rowToSchedule(r), title: f?.title || "ฟอร์ม", icon: f?.icon || "📋" };
  });
  return { schedules, teamMembers, memberIds, names };
}

/** ผู้รับผิดชอบ = สมาชิกทีมที่เลือก ∪ คนที่เลือก (ที่ยังอยู่ใน workspace ถ้ารู้รายชื่อ) */
export function assigneesOf(c: Pick<ScheduleConfig, "assignTeams" | "assignUsers">, teamMembers: Map<string, string[]>, memberIds?: Set<string>): string[] {
  const s = new Set<string>(c.assignUsers);
  for (const t of c.assignTeams) for (const u of teamMembers.get(t) ?? []) s.add(u);
  return [...s].filter((u) => !memberIds || memberIds.size === 0 || memberIds.has(u));
}

async function loadCompletions(supabase: SupabaseClient, tenantId: string, formIds: string[], from: number): Promise<Map<string, Completion[]>> {
  const out = new Map<string, Completion[]>();
  if (!formIds.length) return out;
  // ใบออฟไลน์: filled_at อาจเก่ากว่า submitted_at ได้ถึง 7 วัน → ดึงตาม submitted_at แล้วกรองด้วยเวลากรอกจริง
  const { data } = await supabase
    .from("submissions")
    .select("form_id, submitted_by, user_name, submitted_at, filled_at")
    .eq("tenant_id", tenantId)
    .in("form_id", formIds)
    .gte("submitted_at", new Date(from - EARLY_MIN * 60_000).toISOString())
    .order("submitted_at", { ascending: true })
    .limit(20000);
  for (const r of (data || []) as Record<string, unknown>[]) {
    const at = Date.parse((r.filled_at as string) || (r.submitted_at as string));
    if (!Number.isFinite(at)) continue;
    const a = out.get(r.form_id as string) ?? [];
    a.push({ userId: (r.submitted_by as string) ?? null, userName: (r.user_name as string) || "", at });
    out.set(r.form_id as string, a);
  }
  return out;
}

export interface TodayRound {
  formId: string;
  title: string;
  icon: string;
  time: string;
  open: string;
  due: string;
  /** สถานะจากมุมผู้ใช้ (โหมด each = ของตัวเอง ถ้าเป็นผู้รับผิดชอบ) */
  status: RoundStatus;
  mode: "once" | "each";
  /** ฉันเป็นผู้รับผิดชอบรอบนี้ไหม */
  mine: boolean;
  expected: number;
  doneUsers: number;
  doneBy: { name: string; at: string; late: boolean }[];
  missingNames: string[];
  /** รอบของเมื่อวานที่ยังค้าง */
  carried: boolean;
}

/**
 * รอบของวันนี้ (เวลาไทย) + รอบเมื่อวานที่ยังทำได้แต่ยังไม่ทำ
 * ผู้ดูแลเห็นทุกตาราง · คนอื่นเห็นเฉพาะที่ตัวเองรับผิดชอบ (ตารางที่ไม่ระบุผู้รับผิดชอบ = ทุกคนที่เห็นฟอร์ม)
 */
export async function loadTodayRounds(
  supabase: SupabaseClient, tenantId: string, userId: string, manager: boolean, visibleFormIds: Set<string>, nowMs = Date.now(),
): Promise<TodayRound[] | null> {
  const ctx = await loadCtx(supabase, tenantId);
  if (!ctx) return null;
  const today = bkkDayStart(nowMs);
  const from = today - DAY;
  const to = today + DAY;
  const relevant = ctx.schedules.filter((s) => {
    if (!visibleFormIds.has(s.formId)) return false;
    if (manager) return true;
    const as = assigneesOf(s, ctx.teamMembers, ctx.memberIds);
    return as.length === 0 || as.includes(userId);
  });
  const comps = await loadCompletions(supabase, tenantId, relevant.map((s) => s.formId), from);
  const out: TodayRound[] = [];
  for (const s of relevant) {
    const assignees = assigneesOf(s, ctx.teamMembers, ctx.memberIds);
    const mine = assignees.length === 0 || assignees.includes(userId);
    const results = evaluateRounds(expandRounds(s, from, to), comps.get(s.formId) ?? [], s.mode, assignees, nowMs);
    for (const r of results) {
      const carried = r.open < today;
      const status = s.mode === "each" && assignees.includes(userId) && !manager ? userStatus(r, userId, nowMs) : r.status;
      // เมื่อวาน: แสดงเฉพาะที่ยังค้างและยังทำทัน
      if (carried && !(r.status === "overdue")) continue;
      const firstBy = new Map<string, Completion>();
      for (const c of r.done) if (!firstBy.has(c.userId || c.userName)) firstBy.set(c.userId || c.userName, c);
      out.push({
        formId: s.formId, title: s.title, icon: s.icon, time: r.time,
        open: new Date(r.open).toISOString(), due: new Date(r.due).toISOString(),
        status, mode: s.mode, mine, expected: r.expected, doneUsers: r.doneUsers,
        doneBy: [...firstBy.values()].map((c) => ({ name: (c.userId && ctx.names.get(c.userId)) || c.userName || "—", at: new Date(c.at).toISOString(), late: c.at >= r.due })),
        missingNames: r.missing.map((u) => ctx.names.get(u) || "—"),
        carried,
      });
    }
  }
  const rank: Record<RoundStatus, number> = { overdue: 0, open: 1, upcoming: 2, late: 3, done: 4, missed: 5 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || a.open.localeCompare(b.open) || a.title.localeCompare(b.title));
}

export interface ComplianceRow extends ComplianceStat {
  formId: string;
  title: string;
  icon: string;
  mode: "once" | "each";
  teamIds: string[];
  /** รายคน (โหมด each) */
  people?: { name: string; due: number; onTime: number; late: number; missed: number }[];
}

/** รวมตามทีมที่รับผิดชอบ (ฟอร์มที่มอบหลายทีม นับให้ทุกทีม) */
export function complianceByTeam(rows: ComplianceRow[], teamNames: Map<string, string>): { teamId: string; name: string; forms: number; due: number; onTime: number; late: number; missed: number; rate: number | null }[] {
  const m = new Map<string, { teamId: string; name: string; forms: number; due: number; onTime: number; late: number; missed: number; rate: number | null }>();
  for (const r of rows) for (const tid of r.teamIds) {
    if (!teamNames.has(tid)) continue;
    const b = m.get(tid) ?? { teamId: tid, name: teamNames.get(tid)!, forms: 0, due: 0, onTime: 0, late: 0, missed: 0, rate: null };
    b.forms++; b.due += r.due; b.onTime += r.onTime; b.late += r.late; b.missed += r.missed;
    m.set(tid, b);
  }
  return [...m.values()].map((b) => ({ ...b, rate: b.due ? Math.round((b.onTime / b.due) * 1000) / 10 : null })).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
}

/** ความครบถ้วนย้อนหลัง N วัน (ถึงตอนนี้) ต่อฟอร์ม · ยังไม่รัน 0064 = null */
export async function loadCompliance(supabase: SupabaseClient, tenantId: string, days: number, nowMs = Date.now()): Promise<ComplianceRow[] | null> {
  const ctx = await loadCtx(supabase, tenantId);
  if (!ctx) return null;
  if (!ctx.schedules.length) return [];
  const from = bkkDayStart(nowMs) - (days - 1) * DAY;
  const to = nowMs + 1;
  const comps = await loadCompletions(supabase, tenantId, ctx.schedules.map((s) => s.formId), from);
  return ctx.schedules.map((s) => {
    const assignees = assigneesOf(s, ctx.teamMembers, ctx.memberIds);
    const results = evaluateRounds(expandRounds(s, from, to), comps.get(s.formId) ?? [], s.mode, assignees, nowMs);
    const row: ComplianceRow = { formId: s.formId, title: s.title, icon: s.icon, mode: s.mode, teamIds: s.assignTeams, ...compliance(results, nowMs) };
    if (s.mode === "each" && assignees.length) {
      row.people = assignees.map((u) => {
        let due = 0, onTime = 0, late = 0, missed = 0;
        for (const r of results) {
          if (nowMs < r.due) continue;
          const st = userStatus(r, u, nowMs);
          due++;
          if (st === "done") onTime++;
          else if (st === "late") late++;
          else if (st === "missed") missed++;
        }
        return { name: ctx.names.get(u) || "—", due, onTime, late, missed };
      }).sort((a, b) => (a.due ? a.onTime / a.due : 1) - (b.due ? b.onTime / b.due : 1));
    }
    return row;
  }).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
}

/** ตารางของฟอร์มเดียว (ใช้ในหน้าแก้ฟอร์ม) */
export async function loadFormSchedule(supabase: SupabaseClient, formId: string): Promise<ScheduleConfig | null | "missing"> {
  const { data, error } = await supabase.from("form_schedules").select("*").eq("form_id", formId).maybeSingle();
  if (error) return "missing";
  return data ? rowToSchedule(data as Record<string, unknown>) : null;
}
