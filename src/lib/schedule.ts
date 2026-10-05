// ============================================================
// รอบตรวจตามตาราง (0064) — คำนวณรอบและสถานะ (ฟังก์ชันล้วน · ทดสอบได้)
// เวลาไทย UTC+7 คงที่ (ไม่มี DST) · ใบที่นับ = เวลากรอกจริง (filled_at ?? submitted_at)
// ใบหนึ่งนับให้รอบเดียว: รอบล่าสุดที่เปิดแล้ว (ยอมให้ทำก่อนเปิด 15 นาที)
// ทำหลังกำหนดแต่ก่อนรอบถัดไปเปิด = "สาย" · รอบถัดไปเปิดแล้วยังไม่ทำ = "ขาด"
// ============================================================

export type ScheduleFreq = "daily" | "weekdays" | "weekly" | "monthly";
export type ScheduleMode = "once" | "each";

export interface ScheduleConfig {
  formId: string;
  enabled: boolean;
  freq: ScheduleFreq;
  days: number[];
  times: string[];
  windowMin: number;
  assignTeams: string[];
  assignUsers: string[];
  mode: ScheduleMode;
  notifyStart: boolean;
  notifyOverdue: boolean;
  escalateUsers: string[];
}

export const EARLY_MIN = 15;
const TZ_MS = 7 * 3600_000;
const DAY_MS = 86400_000;

export const DEFAULT_SCHEDULE: Omit<ScheduleConfig, "formId"> = {
  enabled: true, freq: "daily", days: [], times: ["08:00"], windowMin: 120,
  assignTeams: [], assignUsers: [], mode: "once", notifyStart: true, notifyOverdue: true, escalateUsers: [],
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ตรวจ/ทำความสะอาดค่าตั้ง · คืนข้อความผิดพลาด (ภาษาไทย) หรือค่าที่พร้อมบันทึก */
export function normalizeSchedule(c: ScheduleConfig): { error: string } | { value: ScheduleConfig } {
  const times = [...new Set(c.times.map((t) => t.trim()).filter(Boolean))].sort();
  if (!times.length) return { error: "ต้องมีเวลาเปิดรอบอย่างน้อย 1 เวลา" };
  if (times.length > 12) return { error: "เวลาเปิดรอบได้ไม่เกิน 12 เวลาต่อวัน" };
  if (times.some((t) => !HHMM.test(t))) return { error: "รูปแบบเวลาไม่ถูกต้อง" };
  const windowMin = Math.round(Number(c.windowMin));
  if (!(windowMin >= 15 && windowMin <= 1440)) return { error: "ระยะเวลาให้ทำต้องอยู่ระหว่าง 15 นาที ถึง 24 ชั่วโมง" };
  let days: number[] = [];
  if (c.freq === "weekly") {
    days = [...new Set(c.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    if (!days.length) return { error: "เลือกวันในสัปดาห์อย่างน้อย 1 วัน" };
  } else if (c.freq === "monthly") {
    days = [...new Set(c.days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31))].sort((a, b) => a - b);
    if (!days.length) return { error: "เลือกวันที่ของเดือนอย่างน้อย 1 วัน" };
  }
  const mode: ScheduleMode = c.mode === "each" ? "each" : "once";
  if (mode === "each" && !c.assignTeams.length && !c.assignUsers.length)
    return { error: "โหมด “ทุกคนต้องทำ” ต้องเลือกทีมหรือคนที่รับผิดชอบ" };
  // รอบซ้อนกัน: ระยะเวลาให้ทำยาวกว่าช่วงห่างของรอบ → ใบเดียวอาจถูกนับผิดรอบ
  const mins = times.map(toMin);
  for (let i = 1; i < mins.length; i++)
    if (mins[i] - mins[i - 1] < windowMin) return { error: "ระยะเวลาให้ทำยาวกว่าช่วงห่างระหว่างรอบ — ลดเวลาให้ทำหรือเว้นรอบให้ห่างขึ้น" };
  if (mins.length > 1 && mins[0] + 1440 - mins[mins.length - 1] < windowMin && c.freq === "daily")
    return { error: "ระยะเวลาให้ทำยาวกว่าช่วงห่างระหว่างรอบ — ลดเวลาให้ทำหรือเว้นรอบให้ห่างขึ้น" };
  return {
    value: {
      ...c, freq: (["daily", "weekdays", "weekly", "monthly"] as const).includes(c.freq) ? c.freq : "daily",
      days, times, windowMin, mode,
      assignTeams: [...new Set(c.assignTeams)], assignUsers: [...new Set(c.assignUsers)], escalateUsers: [...new Set(c.escalateUsers)],
    },
  };
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** วันที่ (เวลาไทย) ของเวลา ms → ms ของเที่ยงคืนไทยวันนั้น (เป็น UTC) */
export function bkkDayStart(ms: number): number {
  return Math.floor((ms + TZ_MS) / DAY_MS) * DAY_MS - TZ_MS;
}

/** วันนี้อยู่ในตารางไหม (dayStart = เที่ยงคืนไทย) */
export function dayMatches(freq: ScheduleFreq, days: number[], dayStart: number): boolean {
  const d = new Date(dayStart + TZ_MS); // อ่านค่า UTC = ค่าเวลาไทย
  const dow = d.getUTCDay();
  if (freq === "daily") return true;
  if (freq === "weekdays") return dow >= 1 && dow <= 5;
  if (freq === "weekly") return days.includes(dow);
  const date = d.getUTCDate();
  if (days.includes(date)) return true;
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return date === last && days.some((x) => x > last);
}

export interface Round {
  /** เวลาเปิดรอบ (ms) */
  open: number;
  /** ครบกำหนด (ms) */
  due: number;
  /** รอบถัดไปเปิด = หมดสิทธิ์นับว่าทำ (ms) */
  cutoff: number;
  /** 'HH:MM' */
  time: string;
}

/** รอบทั้งหมดที่เปิดในช่วง [from, to) · cutoff = เวลาเปิดของรอบถัดไป (หาไกลสุด 62 วัน) */
export function expandRounds(c: Pick<ScheduleConfig, "freq" | "days" | "times" | "windowMin">, from: number, to: number): Round[] {
  const out: Round[] = [];
  const times = [...c.times].sort();
  const opensOn = (dayStart: number) => (dayMatches(c.freq, c.days, dayStart) ? times.map((t) => ({ t, open: dayStart + toMin(t) * 60_000 })) : []);
  const all: { t: string; open: number }[] = [];
  // เดินจนเลย to แล้วหารอบถัดไปอีก 1 รอบเพื่อใช้เป็น cutoff
  for (let day = bkkDayStart(from); day < to + 62 * DAY_MS; day += DAY_MS) {
    all.push(...opensOn(day));
    if (all.length && all[all.length - 1].open >= to) break;
  }
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    if (r.open < from || r.open >= to) continue;
    const next = all[i + 1]?.open ?? r.open + 62 * DAY_MS;
    out.push({ open: r.open, due: r.open + c.windowMin * 60_000, cutoff: next, time: r.t });
  }
  return out;
}

export interface Completion {
  userId: string | null;
  userName: string;
  /** เวลากรอกจริง (ms) */
  at: number;
}

export type RoundStatus = "upcoming" | "open" | "overdue" | "missed" | "done" | "late";

export interface RoundResult extends Round {
  status: RoundStatus;
  /** ใบที่นับให้รอบนี้ (เรียงตามเวลา) */
  done: Completion[];
  /** โหมด each: คนที่ต้องทำ / ที่ทำแล้ว (ตรงเวลา+สาย) */
  expected: number;
  doneUsers: number;
  onTimeUsers: number;
  /** โหมด each: id คนที่ยังไม่ทำ */
  missing: string[];
}

/** ใบนี้นับให้รอบไหน: รอบล่าสุดที่ open - 15 นาที <= at < cutoff */
export function roundIndexFor(rounds: Round[], at: number): number {
  let idx = -1;
  for (let i = 0; i < rounds.length; i++) {
    if (rounds[i].open - EARLY_MIN * 60_000 <= at) idx = i;
    else break;
  }
  if (idx < 0) return -1;
  return at < rounds[idx].cutoff ? idx : -1;
}

function statusOf(now: number, r: Round, complete: boolean, onTime: boolean): RoundStatus {
  if (complete) return onTime ? "done" : "late";
  if (now < r.open) return "upcoming";
  if (now < r.due) return "open";
  if (now < r.cutoff) return "overdue";
  return "missed";
}

/**
 * จับคู่ใบที่ส่งกับรอบ
 * once: ครบเมื่อมีใบแรก · ตรงเวลาถ้าใบแรกก่อนกำหนด
 * each: ครบเมื่อทุกคนใน assignees ทำ · ตรงเวลาถ้าทุกคนทำก่อนกำหนด (ไม่มีรายชื่อ = ใช้แบบ once)
 */
export function evaluateRounds(rounds: Round[], completions: Completion[], mode: ScheduleMode, assignees: string[], now: number): RoundResult[] {
  const sorted = [...rounds].sort((a, b) => a.open - b.open);
  const buckets: Completion[][] = sorted.map(() => []);
  for (const c of [...completions].sort((a, b) => a.at - b.at)) {
    const i = roundIndexFor(sorted, c.at);
    if (i >= 0) buckets[i].push(c);
  }
  const each = mode === "each" && assignees.length > 0;
  return sorted.map((r, i) => {
    const done = buckets[i];
    if (!each) {
      const first = done[0];
      const complete = !!first;
      const onTime = complete && first.at < r.due;
      return { ...r, status: statusOf(now, r, complete, onTime), done, expected: 1, doneUsers: complete ? 1 : 0, onTimeUsers: onTime ? 1 : 0, missing: [] };
    }
    const firstBy = new Map<string, number>();
    for (const c of done) if (c.userId && !firstBy.has(c.userId)) firstBy.set(c.userId, c.at);
    const did = assignees.filter((u) => firstBy.has(u));
    const onTimeUsers = assignees.filter((u) => (firstBy.get(u) ?? Infinity) < r.due).length;
    const complete = did.length === assignees.length;
    return {
      ...r, status: statusOf(now, r, complete, onTimeUsers === assignees.length), done,
      expected: assignees.length, doneUsers: did.length, onTimeUsers, missing: assignees.filter((u) => !firstBy.has(u)),
    };
  });
}

/** สถานะของผู้ใช้คนหนึ่งในรอบโหมด each */
export function userStatus(r: RoundResult, userId: string, now: number): RoundStatus {
  const mine = r.done.find((c) => c.userId === userId);
  return statusOf(now, r, !!mine, !!mine && mine.at < r.due);
}

export interface ComplianceStat {
  /** หน่วยที่ถึงกำหนดแล้ว (รอบ หรือ รอบ×คน ในโหมด each) */
  due: number;
  onTime: number;
  late: number;
  missed: number;
  /** ยังไม่ครบแต่ยังทำทัน (เลยกำหนดแต่รอบถัดไปยังไม่เปิด) */
  pending: number;
  /** % ตรงเวลา ของที่ถึงกำหนด (null = ยังไม่มีรอบถึงกำหนด) */
  rate: number | null;
}

/** สรุปความครบถ้วน: นับเฉพาะรอบที่เลยกำหนดแล้ว */
export function compliance(results: RoundResult[], now: number): ComplianceStat {
  let due = 0, onTime = 0, late = 0, missed = 0, pending = 0;
  for (const r of results) {
    if (now < r.due && r.status !== "done") continue; // ยังไม่ถึงกำหนด (ทำเสร็จตรงเวลาแล้วนับได้เลย)
    if (now < r.due && r.status === "done") { due += r.expected; onTime += r.onTimeUsers; continue; }
    due += r.expected;
    onTime += r.onTimeUsers;
    const lateN = r.doneUsers - r.onTimeUsers;
    late += lateN;
    const left = r.expected - r.doneUsers;
    if (now < r.cutoff) pending += left;
    else missed += left;
  }
  return { due, onTime, late, missed, pending, rate: due ? Math.round((onTime / due) * 1000) / 10 : null };
}

/** ข้อความสรุปความถี่ (ไทย) สำหรับ UI */
export const DOW_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
export const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
