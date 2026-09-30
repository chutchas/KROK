import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { rowToAttachment, type Attachment } from "@/lib/attachments";
import { resolveFormOptions } from "@/lib/datasets-server";
import type { DraftData } from "@/lib/drafts";
import FillWizard from "./FillWizard";

export const dynamic = "force-dynamic";

export default async function FillPage({
  params,
  searchParams,
}: {
  params: Promise<{ formId: string }>;
  searchParams: Promise<{ draft?: string }>;
}) {
  const { formId } = await params;
  const { draft: draftParam } = await searchParams;
  const session = await getSession();
  if (!session) redirect(`/login?next=/fill/${formId}`);

  const supabase = await createClient();
  const { data } = await supabase
    .from("forms")
    .select("id, title, icon, schema, version, requires_approval, approval_chain, require_approved_device")
    .eq("id", formId)
    .is("deleted_at", null)
    .maybeSingle();

  // ไม่พบในองค์กรที่ล็อกอินอยู่ — อาจเป็นฟอร์ม "สาธารณะ" ของ tenant อื่น
  // (เช่น สแกน QR ของ Tenant A ขณะล็อกอิน Tenant B) → พาไปหน้ากรอกสาธารณะแทน
  // ผู้ใช้จึงกรอกได้เลยโดยไม่ต้อง logout
  if (!data) {
    const admin = getAdminClient();
    if (admin) {
      const { data: pub } = await admin
        .from("forms")
        .select("visibility, status, deleted_at")
        .eq("id", formId)
        .maybeSingle();
      if (pub && pub.visibility === "public" && pub.status === "published" && !pub.deleted_at) {
        redirect(`/f/${formId}`);
      }
    }
    notFound();
  }

  // เอกสารที่เกี่ยวข้อง (ถ้ายังไม่ได้รัน migration 0025 จะได้ลิสต์ว่าง — ฟอร์มยังกรอกได้ตามปกติ)
  let attachments: Attachment[] = [];
  try {
    const { data: att } = await supabase
      .from("form_attachments")
      .select("id, field_id, kind, name, mime, size_bytes, url")
      .eq("form_id", formId)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });
    attachments = (att || []).map((r) => rowToAttachment(r as Record<string, unknown>));
  } catch { /* ไม่มีตาราง = ไม่มีเอกสารแนบ */ }

  // ตัวเลือก dropdown จากข้อมูลอ้างอิง — ฝังมากับหน้าเพื่อให้กรอกออฟไลน์ได้ด้วยข้อมูลรอบล่าสุด
  // (ยังไม่ได้รัน migration 0030 → ใช้ตัวเลือกที่พิมพ์ไว้ในฟอร์มตามเดิม)
  let schema = readSchema(data.schema);
  try {
    schema = await resolveFormOptions(schema, supabase, session.tenantId);
  } catch { /* ใช้ schema เดิม */ }

  // กรอกต่อจากแบบร่าง (ของผู้ใช้คนนี้เท่านั้น — RLS)
  let draft: DraftData | null = null;
  if (draftParam && /^[0-9a-f-]{36}$/i.test(draftParam)) {
    try {
      const { data: d } = await supabase
        .from("submission_drafts")
        .select("id, form_version, title, step_idx, mode, answers, media, doc_extracts, updated_at")
        .eq("id", draftParam)
        .eq("form_id", formId)
        .eq("user_id", session.userId)
        .maybeSingle();
      if (d)
        draft = {
          id: d.id as string,
          formVersion: (d.form_version as number) ?? 1,
          title: (d.title as string) || "",
          stepIdx: (d.step_idx as number) ?? 0,
          mode: d.mode === "paper" ? "paper" : "mobile",
          answers: (d.answers as Record<string, unknown>) || {},
          media: (d.media as Record<string, string>) || {},
          docExtracts: Array.isArray(d.doc_extracts) ? (d.doc_extracts as DraftData["docExtracts"]) : [],
          updatedAt: d.updated_at as string,
        };
    } catch { /* ยังไม่ได้รัน migration 0032 = เปิดฟอร์มเปล่า */ }
  }

  return (
    <FillWizard
      key={draft?.id ?? "new"}
      draft={draft}
      formId={data.id as string}
      title={data.title as string}
      icon={data.icon as string}
      version={(data.version as number) ?? 1}
      requiresApproval={!!data.requires_approval}
      approvalChain={(data.approval_chain as unknown[]) || []}
      schema={schema}
      tenantId={session.tenantId}
      userId={session.userId}
      userName={session.displayName}
      attachments={attachments}
      requireDevice={!!data.require_approved_device}
    />
  );
}

/**
 * อ่าน schema จาก DB ผ่าน sanitizeSchema เสมอ
 * นอกจากกันข้อมูลเพี้ยนแล้ว ยังแปลงฟิลด์ชนิด "barcode" ของเดิม
 * ให้เป็น text + แหล่งเติมข้อมูลแบบสแกน เพื่อให้ฟอร์มเก่ายังมีปุ่มสแกนเหมือนเดิม
 */
function readSchema(raw: unknown): FormSchema {
  try {
    return sanitizeSchema(raw);
  } catch {
    return raw as FormSchema;
  }
}
