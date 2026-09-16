import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import DevicesClient, { type DeviceRow, type LockedForm } from "./DevicesClient";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "admin")
    return <div style={{ color: "var(--ink-2)" }}>หน้านี้สำหรับ owner/admin เท่านั้น</div>;

  const supabase = await createClient();
  const [{ data: devices }, { data: lockedForms }, { data: links }] = await Promise.all([
    supabase
      .from("devices")
      .select("id, name, status, platform, first_user_name, approved_at, last_seen_at, created_at")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("forms")
      .select("id, title, icon, device_scope")
      .eq("tenant_id", session.tenantId)
      .eq("require_approved_device", true)
      .is("deleted_at", null)
      .order("title", { ascending: true }),
    supabase.from("form_devices").select("form_id, device_id").eq("tenant_id", session.tenantId),
  ]);

  const rows: DeviceRow[] = ((devices || []) as Record<string, unknown>[]).map((d) => ({
    id: d.id as string,
    name: (d.name as string) || "อุปกรณ์",
    status: (d.status as DeviceRow["status"]) || "pending",
    platform: (d.platform as string) || "",
    firstUserName: (d.first_user_name as string) || "",
    approvedAt: (d.approved_at as string) || null,
    lastSeenAt: (d.last_seen_at as string) || null,
  }));

  const locked: LockedForm[] = ((lockedForms || []) as Record<string, unknown>[]).map((f) => ({
    id: f.id as string,
    title: f.title as string,
    icon: f.icon as string,
    scope: (f.device_scope as LockedForm["scope"]) ?? "any",
  }));

  // "<formId>:<deviceId>" ของคู่ที่ผูกกันอยู่
  const linked = ((links || []) as { form_id: string; device_id: string }[]).map((l) => `${l.form_id}:${l.device_id}`);

  return <DevicesClient rows={rows} lockedForms={locked} linked={linked} />;
}
