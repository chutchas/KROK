import { enforceMenu, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import IntegrationsClient, { type WebhookItem, type FormOption, type NotifySettings } from "./IntegrationsClient";
import type { IntakeConfig } from "./IntakePanel";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const session = await enforceMenu("integrations");
  if (!canManage(session.role))
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin/designer เท่านั้น</div>;

  const supabase = await createClient();
  const [{ data: whData }, { data: formData }, { data: nData }] = await Promise.all([
    supabase
      .from("webhooks")
      .select("id, name, url, events, secret, active, last_status, last_at, form_id, fields")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("forms")
      .select("id, title, icon, schema")
      .eq("tenant_id", session.tenantId)
      .is("deleted_at", null)
      .order("title"),
    supabase.from("tenant_notify").select("*").eq("tenant_id", session.tenantId).maybeSingle(),
  ]);
  const [{ data: teamRows }, { data: memberRows }, intakeRes] = await Promise.all([
    supabase.from("teams").select("id, name").eq("tenant_id", session.tenantId).order("name"),
    supabase.from("memberships").select("user_id, name, email").eq("tenant_id", session.tenantId),
    // ยังไม่ได้รัน migration 0034 → error → ไม่มีค่าตั้ง (แท็บ API จะแจ้งให้รัน migration ตอนบันทึก)
    supabase.from("form_intake").select("form_id, enabled, field_keys, assignee, key_prefix, key_created_at, last_used_at").eq("tenant_id", session.tenantId),
  ]);
  const intake: Record<string, IntakeConfig> = {};
  for (const r of (intakeRes.data || []) as Record<string, unknown>[]) {
    const a = r.assignee as { team_id?: string; user_id?: string } | null;
    intake[r.form_id as string] = {
      enabled: !!r.enabled,
      fieldKeys: (r.field_keys as Record<string, string>) || {},
      assignee: a?.team_id ? `t:${a.team_id}` : a?.user_id ? `u:${a.user_id}` : "",
      keyPrefix: (r.key_prefix as string) ?? null,
      keyCreatedAt: (r.key_created_at as string) ?? null,
      lastUsedAt: (r.last_used_at as string) ?? null,
    };
  }
  const teams = ((teamRows || []) as { id: string; name: string }[]).map((x) => ({ id: x.id, name: x.name }));
  const members = ((memberRows || []) as { user_id: string; name: string | null; email: string | null }[]).map((m) => ({ user_id: m.user_id, name: m.name || m.email || "สมาชิก" }));

  // ไม่ส่ง secret จริงกลับไป client — ส่งแค่ธงว่ามีค่าเก็บไว้แล้ว
  const n = (nData ?? {}) as Record<string, unknown>;
  const notify: NotifySettings = {
    line_enabled: !!n.line_enabled,
    hasLineToken: !!n.line_token,
    line_target: (n.line_target as string) ?? "",
    email_enabled: !!n.email_enabled,
    smtp_host: (n.smtp_host as string) ?? "",
    smtp_port: (n.smtp_port as number) ?? 587,
    smtp_user: (n.smtp_user as string) ?? "",
    hasSmtpPass: !!n.smtp_pass,
    email_from: (n.email_from as string) ?? "",
    email_to: (n.email_to as string[]) ?? [],
    on_created: n.on_created !== false,
    on_approved: !!n.on_approved,
    on_rejected: n.on_rejected !== false,
    fail_only: !!n.fail_only,
    on_case: n.on_case !== false,
  };

  // ฟอร์ม + รายการฟิลด์ (id/label) จาก schema สำหรับตัวเลือก payload
  const forms: FormOption[] = ((formData || []) as Record<string, unknown>[]).map((f) => {
    const schema = (f.schema ?? {}) as { steps?: { fields?: { id?: string; label?: string; type?: string; required?: boolean }[] }[] };
    const fields: { id: string; label: string; type: string; required?: boolean }[] = [];
    for (const s of schema.steps || [])
      for (const fld of s.fields || [])
        if (fld?.id) fields.push({ id: fld.id, label: fld.label || fld.id, type: fld.type || "text", required: !!fld.required });
    return { id: f.id as string, title: (f.title as string) || "ฟอร์ม", icon: (f.icon as string) || "📋", fields };
  });
  const formTitle = new Map(forms.map((f) => [f.id, f.title]));

  const webhooks: WebhookItem[] = ((whData || []) as Record<string, unknown>[]).map((w) => ({
    id: w.id as string,
    name: w.name as string,
    url: w.url as string,
    events: (w.events as string[]) ?? [],
    hasSecret: !!w.secret,
    active: (w.active as boolean) ?? true,
    lastStatus: (w.last_status as string) ?? null,
    lastAt: (w.last_at as string) ?? null,
    formId: (w.form_id as string) ?? null,
    formTitle: w.form_id ? formTitle.get(w.form_id as string) ?? "(ฟอร์มถูกลบ)" : null,
    fields: (w.fields as string[]) ?? [],
  }));

  return (
    <IntegrationsClient
      webhooks={webhooks} forms={forms} notify={notify} intake={intake} teams={teams} members={members}
      initialTab={tab === "webhooks" || tab === "intake" ? tab : "notify"}
    />
  );
}
