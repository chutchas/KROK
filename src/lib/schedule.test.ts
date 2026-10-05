import { describe, expect, it } from "vitest";
import { bkkDayStart, compliance, dayMatches, evaluateRounds, expandRounds, normalizeSchedule, roundIndexFor, userStatus, DEFAULT_SCHEDULE } from "./schedule";

// เวลาไทย → ms
const bkk = (s: string) => Date.parse(`${s}+07:00`);
const H = 3600_000;

describe("dayMatches", () => {
  it("weekdays / weekly / monthly", () => {
    expect(dayMatches("weekdays", [], bkk("2026-10-04T00:00:00"))).toBe(false); // อาทิตย์
    expect(dayMatches("weekdays", [], bkk("2026-10-05T00:00:00"))).toBe(true);
    expect(dayMatches("weekly", [0, 3], bkk("2026-10-07T00:00:00"))).toBe(true); // พุธ
    expect(dayMatches("monthly", [31], bkk("2026-02-28T00:00:00"))).toBe(true); // วันสุดท้ายของ ก.พ.
    expect(dayMatches("monthly", [31], bkk("2026-02-27T00:00:00"))).toBe(false);
    expect(dayMatches("monthly", [15], bkk("2026-02-15T00:00:00"))).toBe(true);
  });
  it("bkkDayStart ใช้เที่ยงคืนเวลาไทย", () => {
    expect(bkkDayStart(bkk("2026-10-05T00:30:00"))).toBe(bkk("2026-10-05T00:00:00"));
    expect(bkkDayStart(bkk("2026-10-05T23:59:00"))).toBe(bkk("2026-10-05T00:00:00"));
  });
});

describe("expandRounds", () => {
  it("หลายกะต่อวัน + cutoff = รอบถัดไป", () => {
    const r = expandRounds({ freq: "daily", days: [], times: ["08:00", "20:00"], windowMin: 120 }, bkk("2026-10-05T00:00:00"), bkk("2026-10-06T00:00:00"));
    expect(r.map((x) => x.time)).toEqual(["08:00", "20:00"]);
    expect(r[0].due).toBe(bkk("2026-10-05T10:00:00"));
    expect(r[0].cutoff).toBe(bkk("2026-10-05T20:00:00"));
    expect(r[1].cutoff).toBe(bkk("2026-10-06T08:00:00"));
  });
  it("weekdays: รอบวันศุกร์ cutoff = วันจันทร์", () => {
    const r = expandRounds({ freq: "weekdays", days: [], times: ["09:00"], windowMin: 60 }, bkk("2026-10-09T00:00:00"), bkk("2026-10-10T00:00:00"));
    expect(r).toHaveLength(1);
    expect(r[0].cutoff).toBe(bkk("2026-10-12T09:00:00"));
  });
});

describe("evaluateRounds", () => {
  const rounds = expandRounds({ freq: "daily", days: [], times: ["08:00", "14:00"], windowMin: 60 }, bkk("2026-10-05T00:00:00"), bkk("2026-10-06T00:00:00"));
  it("once: ตรงเวลา / สาย / เลยกำหนด / ขาด / ยังไม่ถึง", () => {
    const now = bkk("2026-10-05T12:00:00");
    const res = evaluateRounds(rounds, [{ userId: "a", userName: "A", at: bkk("2026-10-05T07:50:00") }], "once", [], now);
    expect(res[0].status).toBe("done"); // ทำก่อนเปิด 10 นาที นับให้รอบนี้
    expect(res[1].status).toBe("upcoming");
    const res2 = evaluateRounds(rounds, [{ userId: "a", userName: "A", at: bkk("2026-10-05T09:30:00") }], "once", [], now);
    expect(res2[0].status).toBe("late");
    expect(evaluateRounds(rounds, [], "once", [], now)[0].status).toBe("overdue");
    expect(evaluateRounds(rounds, [], "once", [], bkk("2026-10-05T14:30:00"))[0].status).toBe("missed");
    expect(evaluateRounds(rounds, [], "once", [], bkk("2026-10-05T14:30:00"))[1].status).toBe("open");
  });
  it("ใบที่ทำหลังรอบถัดไปเปิด นับให้รอบใหม่ ไม่ใช่รอบเก่า", () => {
    expect(roundIndexFor(rounds, bkk("2026-10-05T13:50:00"))).toBe(1); // ก่อนเปิด 10 นาที
    expect(roundIndexFor(rounds, bkk("2026-10-05T13:40:00"))).toBe(0); // ยังเป็นสายของรอบเช้า
    expect(roundIndexFor(rounds, bkk("2026-10-05T07:00:00"))).toBe(-1);
  });
  it("each: ต้องครบทุกคน · นับรายคน", () => {
    const now = bkk("2026-10-05T12:00:00");
    const res = evaluateRounds(rounds, [
      { userId: "a", userName: "A", at: bkk("2026-10-05T08:10:00") },
      { userId: "a", userName: "A", at: bkk("2026-10-05T08:20:00") },
      { userId: "b", userName: "B", at: bkk("2026-10-05T09:30:00") },
    ], "each", ["a", "b", "c"], now);
    expect(res[0]).toMatchObject({ status: "overdue", expected: 3, doneUsers: 2, onTimeUsers: 1, missing: ["c"] });
    expect(userStatus(res[0], "a", now)).toBe("done");
    expect(userStatus(res[0], "b", now)).toBe("late");
    expect(userStatus(res[0], "c", now)).toBe("overdue");
  });
});

describe("compliance", () => {
  it("นับเฉพาะที่ถึงกำหนด", () => {
    const rounds = expandRounds({ freq: "daily", days: [], times: ["08:00"], windowMin: 60 }, bkk("2026-10-01T00:00:00"), bkk("2026-10-05T00:00:00"));
    const now = bkk("2026-10-04T08:30:00"); // รอบวันที่ 4 ยังไม่ครบกำหนด
    const res = evaluateRounds(rounds, [
      { userId: "a", userName: "A", at: bkk("2026-10-01T08:10:00") },
      { userId: "a", userName: "A", at: bkk("2026-10-02T11:00:00") },
    ], "once", [], now);
    const c = compliance(res, now);
    expect(c).toEqual({ due: 3, onTime: 1, late: 1, missed: 1, pending: 0, rate: 33.3 });
  });
});

describe("normalizeSchedule", () => {
  const base = { formId: "f", ...DEFAULT_SCHEDULE };
  it("ตรวจค่าที่ผิด", () => {
    expect(normalizeSchedule({ ...base, times: [] })).toHaveProperty("error");
    expect(normalizeSchedule({ ...base, times: ["25:00"] })).toHaveProperty("error");
    expect(normalizeSchedule({ ...base, freq: "weekly", days: [] })).toHaveProperty("error");
    expect(normalizeSchedule({ ...base, mode: "each" })).toHaveProperty("error");
    expect(normalizeSchedule({ ...base, times: ["08:00", "09:00"], windowMin: 120 })).toHaveProperty("error");
  });
  it("เรียงเวลา + ตัดซ้ำ", () => {
    const r = normalizeSchedule({ ...base, times: ["14:00", "08:00", "08:00"] });
    expect("value" in r && r.value.times).toEqual(["08:00", "14:00"]);
  });
  it("กะดึกข้ามวัน", () => {
    const r = expandRounds({ freq: "daily", days: [], times: ["22:00"], windowMin: 600 }, bkk("2026-10-05T00:00:00"), bkk("2026-10-06T00:00:00"));
    expect(r[0].due - r[0].open).toBe(10 * H);
  });
});
