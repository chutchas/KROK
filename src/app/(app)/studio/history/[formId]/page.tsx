import { notFound } from "next/navigation";
import { enforceMenu, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { diffForms } from "@/lib/form-diff";
import HistoryClient, { type VersionItem } from "./HistoryClient";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ประวัติเวอร์ชันของฟอร์ม (0065) — สรุปความต่างคำนวณที่ server ไม่ส่ง schema ทุกเวอร์ชันไปหน้าจอ */
export default async function FormHistoryPage({ params, searchParams }: { params: Promise<{ formId: string }>; searchParams: Promise<{ v?: string }> }) {
  const session = await enforceMenu("studio");
  if (!canManage(session.role)) notFound();
  const { formId } = await params;
  const { v } = await searchParams;
  if (!UUID_RE.test(formId)) notFound();

  const supabase = await createClient();
  const [{ data: form }, vq] = await Promise.all([
    supabase.from("forms").select("id, title, icon, version, deleted_at").eq("id", formId).eq("tenant_id", session.tenantId).maybeSingle(),
    supabase.from("form_versions").select("version, title, icon, schema, saved_at, saved_by_name, note").eq("form_id", formId).eq("tenant_id", session.tenantId).order("version", { ascending: false }).limit(100),
  ]);
  if (!form) notFound();

  const rows = (vq.data || []) as Record<string, unknown>[];
  const parsed = rows.map((r) => {
    let schema: FormSchema | null = null;
    try { schema = sanitizeSchema(r.schema); } catch { /* เวอร์ชันเก่าเสีย */ }
    return { r, schema };
  });
  const items: VersionItem[] = parsed.map(({ r, schema }, i) => {
    const prev = parsed[i + 1];
    const diff = schema ? diffForms(prev ? prev.schema : null, schema) : null;
    return {
      version: r.version as number,
      title: (r.title as string) || "",
      savedAt: r.saved_at as string,
      by: (r.saved_by_name as string) || "",
      note: (r.note as string) || "",
      current: (r.version as number) === (form.version as number),
      first: !prev,
      diff,
    };
  });

  return (
    <HistoryClient
      formId={formId}
      formTitle={(form.title as string) || ""}
      formIcon={(form.icon as string) || "📋"}
      deleted={!!form.deleted_at}
      items={items}
      missing={!!vq.error}
      focus={v && /^\d+$/.test(v) ? Number(v) : null}
    />
  );
}
