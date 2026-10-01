// ============================================================
// KROK · ฟอร์มกรอกหลายคน (งาน / case) — ฟังก์ชันล้วน ใช้ได้ทั้ง client และ server
// ต้องตรงกับ helper ใน supabase/migrations/0033_form_cases.sql
// ============================================================
import type { FormSchema } from "@/lib/form-schema";

/** ทีมที่รับผิดชอบขั้น i (null = ไม่ได้ตั้งเป็นทีม) */
export function stepTeam(schema: FormSchema, i: number): string | null {
  return schema.steps[i]?.assignee?.team_id ?? null;
}

/** คนที่รับผิดชอบขั้น i (null = ไม่ได้ตั้งเป็นรายบุคคล) */
export function stepUser(schema: FormSchema, i: number): string | null {
  return schema.steps[i]?.assignee?.user_id ?? null;
}

/** ขั้น i ตั้งผู้รับผิดชอบไว้ไหม (ทีมหรือรายบุคคล) — ไม่ตั้ง = คนเดิมกรอกต่อ */
export function stepAssigned(schema: FormSchema, i: number): boolean {
  return !!(stepTeam(schema, i) || stepUser(schema, i));
}

/** ฟอร์มนี้กรอกหลายคนไหม: มีขั้นหลังขั้นแรกที่ตั้งผู้รับผิดชอบไว้ */
export function isWorkflowSchema(schema: FormSchema): boolean {
  return schema.steps.some((_, i) => i > 0 && stepAssigned(schema, i));
}

/** ขั้นสุดท้ายของช่วงที่เริ่มจาก i — ต่อไปจนกว่าขั้นถัดไปจะตั้งผู้รับผิดชอบไว้ */
export function segmentEnd(schema: FormSchema, i: number): number {
  let j = i;
  while (j + 1 < schema.steps.length && !stepAssigned(schema, j + 1)) j++;
  return j;
}

export interface AssigneeWords { team: (name: string) => string; deletedTeam: string; goneUser: string }
const TH_WORDS: AssigneeWords = { team: (n) => `ทีม ${n}`, deletedTeam: "ทีมที่ถูกลบ", goneUser: "ผู้ใช้ที่ไม่อยู่ใน workspace" };

/** ชื่อผู้รับผิดชอบขั้น i สำหรับแสดงผล (words = คำตามภาษาที่เลือก, ไม่ส่ง = ไทย) */
export function assigneeLabel(schema: FormSchema, i: number, teams: Record<string, string>, users: Record<string, string>, words: AssigneeWords = TH_WORDS): string | null {
  const t = stepTeam(schema, i);
  if (t) return teams[t] ? words.team(teams[t]) : words.deletedTeam;
  const u = stepUser(schema, i);
  if (u) return users[u] || words.goneUser;
  return null;
}

/** ช่วงทั้งหมดของฟอร์ม [เริ่ม, จบ] — ใช้แสดงภาพรวมว่าใครทำขั้นไหน */
export function segments(schema: FormSchema): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  while (i < schema.steps.length) {
    const e = segmentEnd(schema, i);
    out.push([i, e]);
    i = e + 1;
  }
  return out;
}

export type CaseStatus = "open" | "done" | "cancelled";
export type CaseAction = "start" | "advance" | "claim" | "release" | "return" | "cancel" | "submit";

export interface CaseHistoryItem {
  action: CaseAction;
  step: number;
  to?: number;
  by: string;
  name: string;
  at: string;
  note?: string | null;
}

export interface CaseDocExtract {
  source_id: string;
  step: number;
  path?: string | null;
  dataUrl?: string;
  raw: { key: string; value: string; confidence: number }[];
  accepted: { key: string; field_id: string; value: string; edited: boolean }[];
}

/** ข้อมูลงานที่ส่งให้หน้ากรอก */
export interface CaseData {
  id: string;
  formVersion: number;
  title: string;
  status: CaseStatus;
  stepIdx: number;
  assigneeTeam: string | null;
  claimedBy: string | null;
  claimedName: string | null;
  createdBy: string | null;
  createdName: string | null;
  createdAt: string;
  updatedAt: string;
  answers: Record<string, unknown>;
  media: Record<string, string>;
  docExtracts: CaseDocExtract[];
  stepMeta: Record<string, { by: string; name: string; at: string }>;
  history: CaseHistoryItem[];
  submissionId: string | null;
}

/** ถูกส่งกลับมาที่ขั้นปัจจุบันไหม (ใช้โชว์เหตุผลให้คนที่ต้องแก้) */
export function lastReturn(c: Pick<CaseData, "history" | "stepIdx">): CaseHistoryItem | null {
  for (let i = c.history.length - 1; i >= 0; i--) {
    const h = c.history[i];
    if (h.action === "advance" || h.action === "submit") return null;
    if (h.action === "return") return h.to === c.stepIdx ? h : null;
  }
  return null;
}

export function caseNo(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export function rowToCase(d: Record<string, unknown>): CaseData {
  return {
    id: d.id as string,
    formVersion: (d.form_version as number) ?? 1,
    title: (d.title as string) || "",
    status: (d.status as CaseStatus) || "open",
    stepIdx: (d.step_idx as number) ?? 0,
    assigneeTeam: (d.assignee_team as string) ?? null,
    claimedBy: (d.claimed_by as string) ?? null,
    claimedName: (d.claimed_name as string) ?? null,
    createdBy: (d.created_by as string) ?? null,
    createdName: (d.created_name as string) ?? null,
    createdAt: d.created_at as string,
    updatedAt: d.updated_at as string,
    answers: (d.answers as Record<string, unknown>) || {},
    media: (d.media as Record<string, string>) || {},
    docExtracts: Array.isArray(d.doc_extracts) ? (d.doc_extracts as CaseDocExtract[]) : [],
    stepMeta: (d.step_meta as CaseData["stepMeta"]) || {},
    history: Array.isArray(d.history) ? (d.history as CaseHistoryItem[]) : [],
    submissionId: (d.submission_id as string) ?? null,
  };
}
