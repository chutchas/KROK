import { enforceMenu, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import StudioClient from "./StudioClient";
import type { FormSchema } from "@/lib/form-schema";

export const dynamic = "force-dynamic";

export interface FormRow {
  id: string;
  title: string;
  icon: string;
  schema: FormSchema;
  created_by_name: string;
  requires_approval: boolean;
  approval_chain: { user_id: string; name: string; label: string }[];
  visibility: "public" | "all" | "teams" | "users";
  visible_teams: string[];
  visible_users: string[];
  status: "draft" | "published" | "archived";
}

export default async function StudioPage() {
  const session = await enforceMenu("studio");
  if (!canManage(session.role))
    return (
      <div style={{ color: "var(--ink-2)" }}>
        บัญชีของคุณเป็นระดับ Operator — ไปที่แท็บ “กรอกฟอร์ม” เพื่อใช้งานได้เลย
      </div>
    );

  const supabase = await createClient();
  const [{ data }, { data: memberRows }, { data: teamRows }] = await Promise.all([
    supabase
      .from("forms")
      .select("id, title, icon, schema, requires_approval, approval_chain, visibility, visible_teams, visible_users, status")
      .eq("tenant_id", session.tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("memberships")
      .select("user_id, name, email, role")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("teams")
      .select("id, name")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: true }),
  ]);

  const forms: FormRow[] = (data || []).map((f) => ({
    id: f.id as string,
    title: f.title as string,
    icon: f.icon as string,
    schema: f.schema as FormSchema,
    created_by_name: "",
    requires_approval: (f.requires_approval as boolean) ?? false,
    approval_chain: (f.approval_chain as FormRow["approval_chain"]) ?? [],
    visibility: (f.visibility as FormRow["visibility"]) ?? "all",
    visible_teams: (f.visible_teams as string[]) ?? [],
    visible_users: (f.visible_users as string[]) ?? [],
    status: (f.status as FormRow["status"]) ?? "published",
  }));

  const members = (memberRows || []).map((m) => ({
    user_id: m.user_id as string,
    name: (m.name as string) || (m.email as string) || "สมาชิก",
    role: m.role as string,
  }));

  const teams = ((teamRows || []) as { id: string; name: string }[]).map((tt) => ({ id: tt.id, name: tt.name }));

  return <StudioClient initialForms={forms} members={members} teams={teams} />;
}
