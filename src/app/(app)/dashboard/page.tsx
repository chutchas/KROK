import { enforceMenu } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getQuotaSnapshot } from "@/lib/quota";
import { quotaWarnings } from "@/lib/quota-warn";
import QuotaBanner from "@/components/QuotaBanner";
import type { DashWidget } from "@/lib/dashboard-meta";
import DashboardClient, { type SubRow, type FormOpt, type Summary } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await enforceMenu("dashboard");
  const supabase = await createClient();

  const [snap, recentRes, formsRes, layoutRes, schedRes] = await Promise.all([
    getQuotaSnapshot(session.tenantId),
    // รายการล่าสุด — ไม่ดึงคำตอบ (ก้อนใหญ่) มาด้วย; หน้าต่างรายละเอียดโหลดเองตอนเปิด
    supabase
      .from("submissions")
      .select("id, form_title, form_icon, user_name, result, fails, duration_s, submitted_at, approval_status")
      .eq("tenant_id", session.tenantId) // เฉพาะ workspace ที่เปิดอยู่
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
    // มีรอบตรวจตามตารางไหม (ไม่มี = ไม่โหลดการ์ด compliance เลย) · ยังไม่รัน 0064 = error → ไม่มี
    supabase.from("form_schedules").select("form_id", { count: "exact", head: true }).eq("tenant_id", session.tenantId).eq("enabled", true),
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

  return (<>
    <QuotaBanner warnings={quotaWarnings(snap)} canUpgrade={snap.ownerId ? snap.ownerId === session.userId : session.role === "owner"} />
    <DashboardClient
      tenantId={session.tenantId}
      initial={(recentRes.data || []) as SubRow[]}
      forms={forms}
      summary={summary}
      hasSchedules={!schedRes.error && (schedRes.count ?? 0) > 0}
      initialWidgets={initialWidgets}
    />
  </>);
}
