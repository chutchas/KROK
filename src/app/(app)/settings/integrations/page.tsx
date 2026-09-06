import { enforceMenu, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import IntegrationsClient, { type WebhookItem, type FormOption } from "./IntegrationsClient";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const session = await enforceMenu("integrations");
  if (!canManage(session.role))
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin/designer เท่านั้น</div>;

  const supabase = await createClient();
  const [{ data: whData }, { data: formData }] = await Promise.all([
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
  ]);

  // ฟอร์ม + รายการฟิลด์ (id/label) จาก schema สำหรับตัวเลือก payload
  const forms: FormOption[] = ((formData || []) as Record<string, unknown>[]).map((f) => {
    const schema = (f.schema ?? {}) as { steps?: { fields?: { id?: string; label?: string; type?: string }[] }[] };
    const fields: { id: string; label: string; type: string }[] = [];
    for (const s of schema.steps || [])
      for (const fld of s.fields || [])
        if (fld?.id) fields.push({ id: fld.id, label: fld.label || fld.id, type: fld.type || "text" });
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

  return <IntegrationsClient webhooks={webhooks} forms={forms} />;
}
