import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import DashboardClient, { type SubRow } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("submissions")
    .select("id, form_title, form_icon, user_name, result, fails, answers, duration_s, submitted_at")
    .order("submitted_at", { ascending: false })
    .limit(100);

  return <DashboardClient tenantId={session.tenantId} initial={(data || []) as SubRow[]} />;
}
