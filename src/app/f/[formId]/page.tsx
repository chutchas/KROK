import { getAdminClient } from "@/lib/supabase/admin";
import type { FormSchema } from "@/lib/form-schema";
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
    />
  );
}
