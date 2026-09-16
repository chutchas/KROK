import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormSchema } from "@/lib/form-schema";
import { rowToAttachment, type Attachment } from "@/lib/attachments";
import PublicFillClient from "./PublicFillClient";

export const dynamic = "force-dynamic";

export default async function PublicFillPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const admin = getAdminClient();

  const notAvailable = (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--bg, #f8fafc)", textAlign: "center" }}>
      <div style={{ maxWidth: 360 }}>
        <div style={{ fontSize: "2rem", marginBottom: 8 }}>🔒</div>
        <h1 style={{ fontSize: "1.15rem", margin: "0 0 6px" }}>ฟอร์มนี้ไม่เปิดให้กรอกแบบสาธารณะ</h1>
        <p style={{ color: "#64748b", fontSize: ".9rem" }}>ลิงก์อาจไม่ถูกต้อง หรือเจ้าของฟอร์มตั้งค่าให้ต้องเข้าสู่ระบบก่อน</p>
      </div>
    </div>
  );

  if (!admin) return notAvailable;

  const { data } = await admin
    .from("forms")
    .select("id, tenant_id, title, icon, schema, version, requires_approval, approval_chain, visibility, status, deleted_at")
    .eq("id", formId)
    .maybeSingle();

  if (!data || data.visibility !== "public" || data.status !== "published" || data.deleted_at) return notAvailable;

  // ถ้าผู้เปิดกำลังล็อกอินอยู่ (ไม่ว่าจะ tenant ไหน) การส่งฟอร์มสาธารณะจะไม่ผูกกับบัญชี
  // → แจ้งเตือนให้รู้ตัวว่ากรอกในฐานะ guest (กันสับสนเคสล็อกอิน tenant อื่นแล้วสแกน QR)
  // เอกสารที่เกี่ยวข้อง — ฟอร์มสาธารณะอ่านผ่าน service role
  let attachments: Attachment[] = [];
  try {
    const { data: att } = await admin
      .from("form_attachments")
      .select("id, field_id, kind, name, mime, size_bytes, url")
      .eq("form_id", formId)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });
    attachments = (att || []).map((r) => rowToAttachment(r as Record<string, unknown>));
  } catch { /* ไม่มีตาราง = ไม่มีเอกสารแนบ */ }

  let loggedIn = false;
  try {
    const supabase = await createClient();
    const { data: u } = await supabase.auth.getUser();
    loggedIn = !!u.user;
  } catch { /* ไม่รู้สถานะล็อกอิน = ถือว่าไม่ล็อกอิน */ }

  return (
    <PublicFillClient
      formId={data.id as string}
      title={data.title as string}
      icon={data.icon as string}
      version={(data.version as number) ?? 1}
      requiresApproval={!!data.requires_approval}
      approvalChain={(data.approval_chain as unknown[]) || []}
      schema={data.schema as FormSchema}
      tenantId={data.tenant_id as string}
      loggedIn={loggedIn}
      attachments={attachments}
    />
  );
}
