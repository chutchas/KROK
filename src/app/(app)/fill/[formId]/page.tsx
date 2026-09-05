import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
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

  if (!data) notFound();

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
