import { Suspense } from "react";
import QuotaHint from "@/components/QuotaHint";
import { runLater } from "@/lib/background";
import { enforceMenu, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { type FormSchema } from "@/lib/form-schema";
import { readSummary, summaryOf } from "@/lib/form-summary";
import FormsListClient, { type DraftListItem, type FormListItem } from "./FormsListClient";
import type { CaseListItem } from "./CasesList";
import { lastReturn, type CaseHistoryItem } from "@/lib/case-flow";
import { loadTodayRounds } from "@/lib/schedule-server";

export const dynamic = "force-dynamic";

interface FormRow {
  id: string;
  title: string;
  icon: string;
  schema?: FormSchema;
  summary?: unknown;
  visibility: "all" | "teams" | "users" | null;
  visible_teams: string[] | null;
  visible_users: string[] | null;
}

export default async function FormsPage({ searchParams }: { searchParams: Promise<{ f?: string; tab?: string }> }) {
  const session = await enforceMenu("forms");
  const { f: highlightId, tab } = await searchParams;

  const supabase = await createClient();
  // แบบร่างไม่ต้องรอข้อมูลทีม — เริ่มโหลดพร้อมกันเลย
  const draftsP = loadDrafts(supabase, session.tenantId, session.userId);
  const formsQuery = (extra: string) => supabase
    .from("forms")
    .select(`id, title, icon, visibility, visible_teams, visible_users, ${extra}`)
    .eq("tenant_id", session.tenantId)
    .eq("status", "published")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const manager = canManage(session.role);
  // รายการฟอร์มที่ผู้ใช้เห็น (สรุปย่อ 0050 แทน schema เต็ม · ยังไม่รัน = ดึง schema แบบเดิม)
  const formsP = (async () => {
    const [first, { data: teamIdRows }] = await Promise.all([formsQuery("summary"), supabase.rpc("my_team_ids")]);
    const { data } = first.error ? await formsQuery("schema") : first;
    const myTeams = new Set(((teamIdRows as string[] | null) || []).map(String));
    const visible = ((data || []) as unknown as FormRow[]).filter((f) => {
      if (manager) return true; // ผู้ดูแลเห็นทุกฟอร์มเพื่อทดสอบ/แก้ไข
      const mode = f.visibility ?? "all";
      if (mode === "all") return true;
      if (mode === "teams") return (f.visible_teams || []).some((tid) => myTeams.has(String(tid)));
      if (mode === "users") return (f.visible_users || []).includes(session.userId);
      return true;
    });
    return { myTeams, visible };
  })();
  // รอบตรวจวันนี้ (0064): เริ่มโหลดพร้อมกับรายการฟอร์ม แล้วกรองด้วยฟอร์มที่เห็นทีหลัง · ยังไม่รัน/พลาด = ไม่แสดงแท็บ
  const todayP = loadTodayRounds(supabase, session.tenantId, session.userId, manager, formsP.then((r) => new Set(r.visible.map((f) => f.id)))).catch(() => null);
  const { myTeams, visible } = await formsP;

  const forms: FormListItem[] = visible.map((f) => {
    const sm = f.schema ? summaryOf(f.schema) : readSummary(f.summary);
    return { id: f.id, title: f.title, icon: f.icon, steps: sm.steps, fields: sm.fields, category: sm.category, workflow: sm.workflow };
  });

  const [drafts, cases, today] = await Promise.all([
    draftsP,
    loadCases(supabase, session.tenantId, session.userId, [...myTeams], manager),
    // รอบตรวจตามตาราง (0064) · ยังไม่รัน/พลาด = ไม่แสดงแท็บ
    todayP,
  ]);

  return (
    <>
    {/* ส่งฟอร์มครบโควตาเดือน/พื้นที่เต็ม = กดส่งแล้วจะไม่ผ่าน → บอกก่อนเริ่มกรอก */}
    <Suspense fallback={null}><QuotaHint session={session} metrics={["submissions", "storage"]} onlyFull={!manager} /></Suspense>
    <FormsListClient
      forms={forms}
      drafts={drafts}
      cases={cases}
      today={today}
      initialTab={tab === "drafts" ? "drafts" : tab === "tasks" ? "tasks" : tab === "today" ? "today" : "all"}
      highlightId={highlightId}
      canCreate={manager}
    />
    </>
  );
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * แบบร่างของผู้ใช้คนนี้ใน workspace ปัจจุบัน
 * ร่างที่หมดอายุ (เกิน 30 วันหลังแก้ไขล่าสุด) ถูกลบทิ้งพร้อมไฟล์ตรงนี้
 * (ยังไม่ได้รัน migration 0032 → คืนลิสต์ว่าง)
 */
async function loadDrafts(supabase: ServerClient, tenantId: string, userId: string): Promise<DraftListItem[]> {
  try {
    const nowIso = new Date().toISOString();
    // ลบร่างหมดอายุหลังตอบหน้าแล้ว (ไม่ถ่วงการเปิดหน้า) — รายการด้านล่างกรองที่หมดอายุออกอยู่แล้ว · พลาด = cron เก็บให้
    runLater(async () => {
      const { data: expired } = await supabase
        .from("submission_drafts")
        .select("id, media")
        .eq("user_id", userId)
        .lt("expires_at", nowIso)
        .limit(50);
      if (expired && expired.length) {
        const paths = (expired as { media: Record<string, unknown> }[]).flatMap((d) => Object.values(d.media || {})).filter((x): x is string => typeof x === "string");
        if (paths.length) await supabase.storage.from("drafts").remove(paths);
        await supabase.from("submission_drafts").delete().in("id", (expired as { id: string }[]).map((d) => d.id));
      }
    });

    const draftsQuery = (formCols: string) => supabase
      .from("submission_drafts")
      .select(`id, form_id, title, step_idx, filled, total, updated_at, expires_at, forms(title, icon, status, deleted_at, ${formCols})`)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .gte("expires_at", nowIso)
      .order("updated_at", { ascending: false })
      .limit(200);
    const firstD = await draftsQuery("summary");
    const { data, error } = firstD.error ? await draftsQuery("schema") : firstD; // ยังไม่รัน 0050
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map((d) => {
      type DF = { title?: string; icon?: string; schema?: FormSchema; summary?: unknown; status?: string; deleted_at?: string | null };
      const fr = d.forms as DF | DF[] | null;
      const f = (Array.isArray(fr) ? fr[0] : fr) ?? null;
      const sm = f?.schema ? summaryOf(f.schema) : f ? readSummary(f.summary) : null;
      return {
        id: d.id as string,
        formId: d.form_id as string,
        formTitle: f?.title || "ฟอร์ม",
        formIcon: f?.icon || "📋",
        available: !!f && f.status === "published" && !f.deleted_at,
        title: (d.title as string) || "",
        stepIdx: (d.step_idx as number) ?? 0,
        steps: sm?.steps || 1,
        filled: (d.filled as number) ?? 0,
        total: (d.total as number) ?? 0,
        updatedAt: d.updated_at as string,
        expiresAt: d.expires_at as string,
        category: sm?.category,
      };
    });
  } catch {
    return [];
  }
}

/**
 * งานของฟอร์มกรอกหลายคนที่เกี่ยวกับผู้ใช้นี้ (ยังไม่ปิด)
 *  - mine:  ฉันถืออยู่ (รวมงานที่ถูกส่งกลับมาหาฉัน)
 *  - pool:  รอคนในทีมของฉันกดรับ
 *  - watch: ฉันเคยทำ แต่ตอนนี้อยู่กับคนอื่น (ติดตามสถานะ)
 * (ยังไม่ได้รัน migration 0033 → คืนลิสต์ว่าง)
 */
async function loadCases(supabase: ServerClient, tenantId: string, userId: string, myTeams: string[], manager: boolean): Promise<CaseListItem[]> {
  try {
    const cols = "id, form_id, form_title, form_icon, title, step_idx, schema, assignee_team, claimed_by, claimed_name, history, updated_at";
    const base = () => supabase.from("form_cases").select(cols).eq("tenant_id", tenantId).eq("status", "open");
    const empty = Promise.resolve({ data: [] as Record<string, unknown>[], error: null });
    const [mine, pool, orphan, watch, teamRows] = await Promise.all([
      base().eq("claimed_by", userId).order("updated_at", { ascending: false }).limit(100),
      myTeams.length
        ? base().is("claimed_by", null).in("assignee_team", myTeams).order("updated_at", { ascending: false }).limit(100)
        : empty,
      // งานที่ไม่มีทีม/คนรับ (เช่น ผู้รับผิดชอบออกจาก workspace, งานจาก API ที่ไม่ได้ตั้งผู้รับ) → ผู้ดูแลเห็นในกองงาน
      manager
        ? base().is("claimed_by", null).is("assignee_team", null).order("updated_at", { ascending: false }).limit(100)
        : empty,
      base().contains("participants", [userId]).order("updated_at", { ascending: false }).limit(50),
      supabase.from("teams").select("id, name").eq("tenant_id", tenantId),
    ]);
    if (mine.error) return [];
    const teamName = new Map(((teamRows.data || []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
    const seen = new Set<string>();
    const out: CaseListItem[] = [];
    const push = (rows: Record<string, unknown>[] | null, kind: CaseListItem["kind"]) => {
      for (const d of rows || []) {
        const id = d.id as string;
        if (seen.has(id)) continue;
        if (kind === "watch" && d.claimed_by === userId) continue;
        seen.add(id);
        const schema = d.schema as FormSchema;
        const stepIdx = (d.step_idx as number) ?? 0;
        const history = (Array.isArray(d.history) ? d.history : []) as CaseHistoryItem[];
        const ret = kind === "mine" ? lastReturn({ history, stepIdx }) : null;
        out.push({
          id,
          formId: d.form_id as string,
          formTitle: (d.form_title as string) || "ฟอร์ม",
          formIcon: (d.form_icon as string) || "📋",
          title: (d.title as string) || "",
          stepIdx,
          steps: schema?.steps?.length ?? 1,
          stepTitle: schema?.steps?.[stepIdx]?.title || `ขั้นตอนที่ ${stepIdx + 1}`,
          teamName: d.assignee_team ? teamName.get(d.assignee_team as string) ?? null : null,
          holderName: (d.claimed_name as string) ?? null,
          kind,
          returned: ret ? { name: ret.name, note: ret.note || "" } : null,
          updatedAt: d.updated_at as string,
          // เริ่มรอตั้งแต่เหตุการณ์ล่าสุดในประวัติ (ส่งต่อ/ส่งกลับ/รับงาน) — การกดบันทึกเฉย ๆ ไม่นับว่าเริ่มรอใหม่
          waitingSince: history.length ? history[history.length - 1].at || (d.updated_at as string) : (d.updated_at as string),
        });
      }
    };
    push(mine.data as Record<string, unknown>[] | null, "mine");
    push(pool.data as Record<string, unknown>[] | null, "pool");
    push(orphan.data as Record<string, unknown>[] | null, "pool");
    push(watch.data as Record<string, unknown>[] | null, "watch");
    return out;
  } catch {
    return [];
  }
}
