import { enforceMenu, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { countFields, type FormSchema } from "@/lib/form-schema";
import FormsListClient, { type DraftListItem, type FormListItem } from "./FormsListClient";

export const dynamic = "force-dynamic";

interface FormRow {
  id: string;
  title: string;
  icon: string;
  schema: FormSchema;
  visibility: "all" | "teams" | "users" | null;
  visible_teams: string[] | null;
  visible_users: string[] | null;
}

export default async function FormsPage({ searchParams }: { searchParams: Promise<{ f?: string; tab?: string }> }) {
  const session = await enforceMenu("forms");
  const { f: highlightId, tab } = await searchParams;

  const supabase = await createClient();
  const [{ data }, { data: teamIdRows }] = await Promise.all([
    supabase
      .from("forms")
      .select("id, title, icon, schema, visibility, visible_teams, visible_users")
      .eq("tenant_id", session.tenantId)
      .eq("status", "published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.rpc("my_team_ids"),
  ]);

  const myTeams = new Set(((teamIdRows as string[] | null) || []).map(String));
  const manager = canManage(session.role);

  const visible = ((data || []) as FormRow[]).filter((f) => {
    if (manager) return true; // ผู้ดูแลเห็นทุกฟอร์มเพื่อทดสอบ/แก้ไข
    const mode = f.visibility ?? "all";
    if (mode === "all") return true;
    if (mode === "teams") return (f.visible_teams || []).some((tid) => myTeams.has(String(tid)));
    if (mode === "users") return (f.visible_users || []).includes(session.userId);
    return true;
  });

  const forms: FormListItem[] = visible.map((f) => ({
    id: f.id,
    title: f.title,
    icon: f.icon,
    steps: f.schema.steps.length,
    fields: countFields(f.schema),
    category: f.schema.category,
  }));

  const drafts = await loadDrafts(supabase, session.tenantId, session.userId);

  return (
    <FormsListClient
      forms={forms}
      drafts={drafts}
      initialTab={tab === "drafts" ? "drafts" : "all"}
      highlightId={highlightId}
      canCreate={manager}
    />
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
    const { data: expired } = await supabase
      .from("submission_drafts")
      .select("id, media")
      .eq("user_id", userId)
      .lt("expires_at", nowIso)
      .limit(50);
    if (expired && expired.length) {
      const paths = (expired as { media: Record<string, string> }[]).flatMap((d) => Object.values(d.media || {}));
      if (paths.length) await supabase.storage.from("drafts").remove(paths);
      await supabase.from("submission_drafts").delete().in("id", (expired as { id: string }[]).map((d) => d.id));
    }

    const { data, error } = await supabase
      .from("submission_drafts")
      .select("id, form_id, title, step_idx, filled, total, updated_at, expires_at, forms(title, icon, schema, status, deleted_at)")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .gte("expires_at", nowIso)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((d) => {
      const fr = d.forms as { title?: string; icon?: string; schema?: FormSchema; status?: string; deleted_at?: string | null } | { title?: string }[] | null;
      const f = (Array.isArray(fr) ? fr[0] : fr) as { title?: string; icon?: string; schema?: FormSchema; status?: string; deleted_at?: string | null } | null;
      return {
        id: d.id as string,
        formId: d.form_id as string,
        formTitle: f?.title || "ฟอร์ม",
        formIcon: f?.icon || "📋",
        available: !!f && f.status === "published" && !f.deleted_at,
        title: (d.title as string) || "",
        stepIdx: (d.step_idx as number) ?? 0,
        steps: f?.schema?.steps?.length ?? 1,
        filled: (d.filled as number) ?? 0,
        total: (d.total as number) ?? 0,
        updatedAt: d.updated_at as string,
        expiresAt: d.expires_at as string,
      };
    });
  } catch {
    return [];
  }
}
