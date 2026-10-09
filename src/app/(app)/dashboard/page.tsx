import { canManage, enforceMenu, hasMenu } from "@/lib/session";
import { loadAttention, type AttentionData } from "@/lib/dashboard-attention";
import { createClient } from "@/lib/supabase/server";
import { getQuotaSnapshot } from "@/lib/quota";
import { quotaWarnings } from "@/lib/quota-warn";
import QuotaBanner from "@/components/QuotaBanner";
import type { DashWidget } from "@/lib/dashboard-meta";
import DashboardClient, { type SubRow, type FormOpt, type Summary, type AreaOpt } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await enforceMenu("dashboard");
  const supabase = await createClient();

  // ฟอร์มที่ผู้ใช้เห็น (RLS 0054 กรองตามสิทธิ์ให้แล้ว) — ตัวเลือกใน widget + กรองรอบตรวจของแถบ "ต้องดูตอนนี้"
  // ห่อด้วย Promise.resolve ให้ยิง query ครั้งเดียวแม้ใช้หลายที่
  const formsP = Promise.resolve(
    supabase.from("forms").select("id, title, icon").eq("tenant_id", session.tenantId).is("deleted_at", null).order("title")
  );
  // มีรอบตรวจตามตารางไหม (ไม่มี = ไม่โหลดการ์ด compliance/รอบเลยกำหนดเลย) · ยังไม่รัน 0064 = error → ไม่มี
  const schedP = Promise.resolve(
    supabase.from("form_schedules").select("form_id", { count: "exact", head: true }).eq("tenant_id", session.tenantId).eq("enabled", true)
  );
  // แถบ "ต้องดูตอนนี้" — ไม่ await: ส่ง promise ไปให้ client แสดงตามมา (ไม่ถ่วงทั้งหน้า) · พลาด = ไม่แสดงแถบ
  const attention: Promise<AttentionData> = (async () => {
    const [canApprove, sched] = await Promise.all([hasMenu(session, "approvals"), schedP]);
    return loadAttention(supabase, {
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      manager: canManage(session.role),
      canApprove,
      hasSchedules: !sched.error && (sched.count ?? 0) > 0,
      visibleFormIds: formsP.then((r) => new Set(((r.data || []) as { id: string }[]).map((f) => f.id))),
    });
  })().catch(() => ({ failedToday: null, overdueRounds: null, approvals: null }));

  const [snap, recentRes, formsRes, layoutRes, schedRes, wsRes, areasRes] = await Promise.all([
    getQuotaSnapshot(session.tenantId),
    // รายการล่าสุด — ไม่ดึงคำตอบ (ก้อนใหญ่) มาด้วย; หน้าต่างรายละเอียดโหลดเองตอนเปิด
    supabase
      .from("submissions")
      .select("id, form_title, form_icon, user_name, result, fails, duration_s, submitted_at, approval_status")
      .eq("tenant_id", session.tenantId) // เฉพาะ workspace ที่เปิดอยู่
      .order("submitted_at", { ascending: false })
      .limit(100),
    formsP,
    // layout ที่บันทึกไว้
    supabase
      .from("dashboard_layouts")
      .select("widgets")
      .eq("user_id", session.userId)
      .eq("tenant_id", session.tenantId)
      .maybeSingle(),
    schedP,
    // dashboard ของ workspace (0073) · ยังไม่รัน = error → ว่าง
    supabase.from("workspace_dashboards").select("widgets").eq("tenant_id", session.tenantId).maybeSingle(),
    // พื้นที่ (ตัวเลือกของ widget "ตามพื้นที่") · ยังไม่รัน 0072 = error → ไม่มีพื้นที่
    supabase.from("workspace_areas").select("id, code, name").eq("tenant_id", session.tenantId).eq("active", true).order("sort").order("name"),
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
  const wsWidgets = wsRes.error ? [] : ((wsRes.data?.widgets as DashWidget[] | undefined) ?? []);
  const isWsAdmin = session.role === "owner" || session.role === "admin";
  const canFill = await hasMenu(session, "forms");

  return (<>
    <QuotaBanner warnings={quotaWarnings(snap)} canUpgrade={snap.ownerId ? snap.ownerId === session.userId : session.role === "owner"} />
    <DashboardClient
      tenantId={session.tenantId}
      initial={(recentRes.data || []) as SubRow[]}
      forms={forms}
      summary={summary}
      hasSchedules={!schedRes.error && (schedRes.count ?? 0) > 0}
      initialWidgets={initialWidgets}
      areas={areasRes.error ? [] : ((areasRes.data || []) as AreaOpt[])}
      workspaceWidgets={wsWidgets}
      workspaceReady={!wsRes.error}
      isWsAdmin={isWsAdmin}
      seesAllForms={canManage(session.role)}
      attention={attention}
      canFill={canFill}
    />
  </>);
}
