import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { FormSchema } from "@/lib/form-schema";
import FillWizard from "./FillWizard";

export const dynamic = "force-dynamic";

export default async function FillPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/fill/${formId}`);

  const supabase = await createClient();
  const { data } = await supabase
    .from("forms")
    .select("id, title, icon, schema, version, requires_approval, approval_chain")
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

  return (
    <FillWizard
      formId={data.id as string}
      title={data.title as string}
      icon={data.icon as string}
      version={(data.version as number) ?? 1}
      requiresApproval={!!data.requires_approval}
      approvalChain={(data.approval_chain as unknown[]) || []}
      schema={data.schema as FormSchema}
      tenantId={session.tenantId}
      userId={session.userId}
      userName={session.displayName}
    />
  );
}
