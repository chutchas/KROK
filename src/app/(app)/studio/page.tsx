import { Suspense } from "react";
import QuotaHint from "@/components/QuotaHint";
import { enforceMenu, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import StudioClient from "./StudioClient";
import type { FormSchema } from "@/lib/form-schema";
import { readSummary, summaryOf, type FormSummary } from "@/lib/form-summary";
import { getTemplate } from "@/lib/form-templates";

export const dynamic = "force-dynamic";

export interface FormRow {
  id: string;
  title: string;
  icon: string;
  /** โหลดตอนกดแก้ไข (ไม่มี = ยังไม่โหลด) — มีเฉพาะตอนยังไม่รัน migration 0050 */
  schema?: FormSchema;
  summary: FormSummary;
  created_by_name: string;
  requires_approval: boolean;
  approval_chain: { user_id: string; name: string; label: string }[];
  visibility: "public" | "all" | "teams" | "users";
  visible_teams: string[];
  visible_users: string[];
  status: "draft" | "published" | "archived";
  require_approved_device: boolean;
  device_scope: "any" | "selected";
}

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ tpl?: string; mode?: string }> }) {
  const session = await enforceMenu("studio");
  if (!canManage(session.role))
    return (
      <div style={{ color: "var(--ink-2)" }}>
        บัญชีของคุณเป็นระดับ Operator — ไปที่แท็บ “กรอกฟอร์ม” เพื่อใช้งานได้เลย
      </div>
    );

  const supabase = await createClient();
  const cols = "id, title, icon, requires_approval, approval_chain, visibility, visible_teams, visible_users, status, require_approved_device, device_scope";
  const formsQuery = (extra: string) => supabase
    .from("forms")
    .select(`${cols}, ${extra}`)
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  // สรุปย่อ (0050) แทน schema เต็มทุกฟอร์ม — schema โหลดตอนกดแก้ไข
  const [first, { data: memberRows }, { data: teamRows }] = await Promise.all([
    formsQuery("summary"),
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
  // ยังไม่รัน 0050 (ไม่มีคอลัมน์ summary) → ดึง schema เต็มแบบเดิม
  const res = first.error ? await formsQuery("schema") : first;
  const data = (res.data || []) as unknown as Record<string, unknown>[];

  const forms: FormRow[] = data.map((f) => ({
    id: f.id as string,
    title: f.title as string,
    icon: f.icon as string,
    ...(f.schema ? { schema: f.schema as FormSchema } : {}),
    summary: f.schema ? summaryOf(f.schema as FormSchema) : readSummary(f.summary),
    created_by_name: "",
    requires_approval: (f.requires_approval as boolean) ?? false,
    approval_chain: (f.approval_chain as FormRow["approval_chain"]) ?? [],
    visibility: (f.visibility as FormRow["visibility"]) ?? "all",
    visible_teams: (f.visible_teams as string[]) ?? [],
    visible_users: (f.visible_users as string[]) ?? [],
    status: (f.status as FormRow["status"]) ?? "published",
    require_approved_device: (f.require_approved_device as boolean) ?? false,
    device_scope: (f.device_scope as FormRow["device_scope"]) ?? "any",
  }));

  const members = (memberRows || []).map((m) => ({
    user_id: m.user_id as string,
    name: (m.name as string) || (m.email as string) || "สมาชิก",
    role: m.role as string,
  }));

  const teams = ((teamRows || []) as { id: string; name: string }[]).map((tt) => ({ id: tt.id, name: tt.name }));

  // ?tpl=<id> จากคลังเทมเพลต → เปิดเป็นร่างในหน้าแก้ไข (ยังไม่บันทึก)
  const { tpl, mode } = await searchParams;
  const template = tpl ? getTemplate(tpl)?.schema ?? null : null;

  return (
    <>
      {/* โควตาใกล้เต็ม/เต็ม — แจ้งก่อนลงมือสร้าง (ไม่บล็อกการโหลดหน้า) */}
      <Suspense fallback={null}><QuotaHint session={session} metrics={["forms", "ai_form_gen", "ai_form_from_image"]} /></Suspense>
      <StudioClient initialForms={forms} members={members} teams={teams} tenantId={session.tenantId} template={template}
        initialMode={mode === "template" || mode === "file" ? mode : "prompt"} />
    </>
  );
}
