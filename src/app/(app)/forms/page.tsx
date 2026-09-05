import { enforceMenu, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { countFields, type FormSchema } from "@/lib/form-schema";
import FormsListClient, { type FormListItem } from "./FormsListClient";

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

export default async function FormsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const session = await enforceMenu("forms");
  const { f: highlightId } = await searchParams;

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

  return <FormsListClient forms={forms} highlightId={highlightId} />;
}
