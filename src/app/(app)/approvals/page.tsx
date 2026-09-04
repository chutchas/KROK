import { redirect } from "next/navigation";
import { getSession, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import ApprovalsClient from "./ApprovalsClient";
import type { PendingSub } from "./ApprovalsClient";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManage(session.role))
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับผู้อนุมัติ (owner/admin/designer) เท่านั้น</div>;

  const supabase = await createClient();
  const { data } = await supabase
    .from("submissions")
    .select("id, form_title, form_icon, user_name, result, fails, answers, submitted_at")
    .eq("approval_status", "pending")
    .order("submitted_at", { ascending: true });

  return <ApprovalsClient tenantId={session.tenantId} initial={(data || []) as PendingSub[]} />;
}
