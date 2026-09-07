import { enforceMenu } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getQuotaSnapshot } from "@/lib/quota";
import type { DashWidget } from "@/lib/dashboard-meta";
import DashboardClient, { type SubRow, type FormOpt, type Summary } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await enforceMenu("dashboard");
  const supabase = await createClient();

  const [snap, recentRes, formsRes, layoutRes] = await Promise.all([
    getQuotaSnapshot(session.tenantId),
    // รายการล่าสุด (ครบฟิลด์ สำหรับ list + modal)
    supabase
      .from("submissions")
      .select("id, form_title, form_icon, user_name, result, fails, answers, duration_s, submitted_at, approval_status")
      .order("submitted_at", { ascending: false })
      .limit(100),
    // ฟอร์มทั้งหมด (สำหรับตัวเลือกใน widget)
    supabase
      .from("forms")
      .select("id, title, icon")
      .eq("tenant_id", session.tenantId)
      .is("deleted_at", null)
      .order("title"),
    // layout ที่บันทึกไว้
    supabase
      .from("dashboard_layouts")
      .select("widgets")
      .eq("user_id", session.userId)
      .eq("tenant_id", session.tenantId)
      .maybeSingle(),
  ]);

  const summary: Summary = {
    forms: { used: snap.formsUsed, max: snap.plan.maxForms },
    members: { used: snap.membersUsed, max: snap.plan.maxMembers },
    ai: { used: snap.aiUsed, max: snap.plan.aiCreditsPerMonth },
    period: snap.period,
  };

  const forms: FormOpt[] = ((formsRes.data || []) as Record<string, unknown>[]).map((f) => ({
    id: f.id as string,
    title: (f.title as string) || "ฟอร์ม",
    icon: (f.icon as string) || "📋",
  }));

  const initialWidgets = (layoutRes.data?.widgets as DashWidget[]) ?? [];

  return (
    <DashboardClient
      tenantId={session.tenantId}
      initial={(recentRes.data || []) as SubRow[]}
      forms={forms}
      summary={summary}
      initialWidgets={initialWidgets}
    />
  );
}
