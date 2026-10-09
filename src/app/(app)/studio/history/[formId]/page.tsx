import { notFound } from "next/navigation";
import { enforceMenu, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { diffForms } from "@/lib/form-diff";
import HistoryClient, { type VersionItem } from "./HistoryClient";

export const metadata = { title: "ประวัติเวอร์ชัน" };

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ประวัติเวอร์ชันของฟอร์ม (0065) — สรุปความต่างคำนวณที่ server ไม่ส่ง schema ทุกเวอร์ชันไปหน้าจอ */
const PAGE = 20;

export default async function FormHistoryPage({ params, searchParams }: { params: Promise<{ formId: string }>; searchParams: Promise<{ v?: string; p?: string }> }) {
  const session = await enforceMenu("studio");
  if (!canManage(session.role)) notFound();
  const { formId } = await params;
  const { v, p } = await searchParams;
  if (!UUID_RE.test(formId)) notFound();

  const supabase = await createClient();
  const focusV = v && /^\d+$/.test(v) ? Number(v) : null;
  // หน้าละ 20 เวอร์ชัน (ดึงเกิน 1 เพื่อคำนวณความต่างของตัวสุดท้ายในหน้า) · ?v= ไม่ระบุหน้า = เปิดหน้าที่มีเวอร์ชันนั้น
  const [{ data: form }, newer] = await Promise.all([
    supabase.from("forms").select("id, title, icon, version, deleted_at").eq("id", formId).eq("tenant_id", session.tenantId).maybeSingle(),
    focusV && !p
      ? supabase.from("form_versions").select("version", { count: "exact", head: true }).eq("form_id", formId).eq("tenant_id", session.tenantId).gt("version", focusV)
      : Promise.resolve({ count: null }),
  ]);
  if (!form) notFound();
  const page = p && /^\d+$/.test(p) ? Math.max(0, Number(p) - 1) : newer.count != null ? Math.floor(newer.count / PAGE) : 0;
  const from = page * PAGE;
  const vq = await supabase.from("form_versions").select("version, title, icon, schema, saved_at, saved_by_name, note", { count: "exact" })
    .eq("form_id", formId).eq("tenant_id", session.tenantId).order("version", { ascending: false }).range(from, from + PAGE);
  const total = vq.count ?? 0;

  const rows = (vq.data || []) as Record<string, unknown>[];
  const parsed = rows.map((r) => {
    let schema: FormSchema | null = null;
    try { schema = sanitizeSchema(r.schema); } catch { /* เวอร์ชันเก่าเสีย */ }
    return { r, schema };
  });
  const items: VersionItem[] = parsed.slice(0, PAGE).map(({ r, schema }, i) => {
    const prev = parsed[i + 1];
    const diff = schema ? diffForms(prev ? prev.schema : null, schema) : null;
    return {
      version: r.version as number,
      title: (r.title as string) || "",
      savedAt: r.saved_at as string,
      by: (r.saved_by_name as string) || "",
      note: (r.note as string) || "",
      current: (r.version as number) === (form.version as number),
      first: !prev && from + i === total - 1,
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
      focus={focusV}
      page={page + 1}
      pages={Math.max(1, Math.ceil(total / PAGE))}
    />
  );
}
