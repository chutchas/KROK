import { describe, it, expect } from "vitest";
import { assigneeLabel, isWorkflowSchema, lastReturn, segmentEnd, segments, stepTeam, stepUser, type CaseHistoryItem } from "@/lib/case-flow";
import { sanitizeSchema, type FormSchema } from "@/lib/form-schema";

const T1 = "20000000-0000-0000-0000-000000000001";
const T2 = "20000000-0000-0000-0000-000000000002";
const f = (id: string) => ({ id, type: "text" as const, label: id, required: false });
const U1 = "10000000-0000-0000-0000-00000000000d";
// "u:<id>" = รายบุคคล, อย่างอื่น = ทีม
const schema = (teams: (string | null)[]): FormSchema => ({
  title: "x", description: "", icon: "📋", flow: "sequential",
  steps: teams.map((t, i) => ({
    id: `s${i + 1}`, title: `S${i + 1}`, fields: [f(`f${i}`)],
    ...(t ? { assignee: t.startsWith("u:") ? { user_id: t.slice(2) } : { team_id: t } } : {}),
  })),
});

describe("case-flow segments (ต้องตรงกับ SQL case_segment_end)", () => {
  it("ฟอร์มที่ไม่ตั้งทีม = ช่วงเดียวทั้งฟอร์ม และไม่ใช่ฟอร์มหลายคน", () => {
    const s = schema([null, null, null]);
    expect(isWorkflowSchema(s)).toBe(false);
    expect(segments(s)).toEqual([[0, 2]]);
  });
  it("ตั้งทีมที่ขั้นแรกอย่างเดียว = ยังเป็นฟอร์มคนเดียว (จำกัดคนเริ่ม)", () => {
    expect(isWorkflowSchema(schema([T1, null]))).toBe(false);
  });
  it("ขั้นที่ไม่ตั้งทีมต่อท้ายช่วงก่อนหน้า", () => {
    const s = schema([null, null, T1, null, T2]);
    expect(isWorkflowSchema(s)).toBe(true);
    expect(segmentEnd(s, 0)).toBe(1);
    expect(segmentEnd(s, 2)).toBe(3);
    expect(segmentEnd(s, 4)).toBe(4);
    expect(segmentEnd(s, 3)).toBe(3); // ส่งกลับมากลางช่วง
    expect(segments(s)).toEqual([[0, 1], [2, 3], [4, 4]]);
    expect(stepTeam(s, 2)).toBe(T1);
    expect(stepTeam(s, 1)).toBeNull();
  });
});

describe("ผู้รับผิดชอบรายบุคคล", () => {
  it("ขั้นรายบุคคลเป็นจุดเริ่มช่วงใหม่เหมือนทีม", () => {
    const s = schema([null, `u:${U1}`, null, T1]);
    expect(isWorkflowSchema(s)).toBe(true);
    expect(segments(s)).toEqual([[0, 0], [1, 2], [3, 3]]);
    expect(stepUser(s, 1)).toBe(U1);
    expect(stepTeam(s, 1)).toBeNull();
  });
  it("ชื่อที่แสดง", () => {
    const s = schema([T1, `u:${U1}`, null]);
    expect(assigneeLabel(s, 0, { [T1]: "QA" }, {})).toBe("ทีม QA");
    expect(assigneeLabel(s, 1, {}, { [U1]: "สมชาย" })).toBe("สมชาย");
    expect(assigneeLabel(s, 2, {}, {})).toBeNull();
  });
});

describe("lastReturn", () => {
  const h = (action: CaseHistoryItem["action"], step: number, to?: number, note?: string): CaseHistoryItem => ({ action, step, to, by: "u", name: "B", at: "", note });
  it("แสดงเหตุผลเมื่อถูกส่งกลับมาที่ขั้นปัจจุบัน", () => {
    expect(lastReturn({ stepIdx: 1, history: [h("start", 0), h("advance", 0, 2), h("claim", 2), h("return", 2, 1, "รูปไม่ชัด")] })?.note).toBe("รูปไม่ชัด");
  });
  it("ส่งต่อใหม่แล้ว = ไม่แสดง", () => {
    expect(lastReturn({ stepIdx: 2, history: [h("return", 2, 1, "x"), h("advance", 1, 2), h("claim", 2)] })).toBeNull();
  });
});

describe("sanitizeSchema: assignee", () => {
  it("เก็บ team_id ที่เป็น uuid และทิ้งค่าที่ไม่ถูกต้อง", () => {
    const s = sanitizeSchema({
      title: "a", steps: [
        { title: "1", fields: [f("a")], assignee: { team_id: T1.toUpperCase() } },
        { title: "2", fields: [f("b")], assignee: { team_id: "not-a-uuid" } },
        { title: "3", fields: [f("c")], assignee: "x" },
        { title: "4", fields: [f("d")], assignee: { user_id: U1 } },
      ],
    });
    expect(s.steps[3].assignee).toEqual({ user_id: U1 });
    expect(s.steps[0].assignee).toEqual({ team_id: T1 });
    expect(s.steps[1].assignee).toBeUndefined();
    expect(s.steps[2].assignee).toBeUndefined();
  });
});
