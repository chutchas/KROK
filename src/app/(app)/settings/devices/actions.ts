"use server";
import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getSession, type KrokSession } from "@/lib/session";

export type DeviceStatus = "pending" | "approved" | "revoked";

export interface RegisterResult {
  deviceId: string;
  status: DeviceStatus;
  name: string;
  /** เครื่องนี้ใช้กรอกฟอร์มที่ส่ง formId มาได้หรือยัง (undefined = ไม่ได้ถาม) */
  allowedForForm?: boolean;
}

/** เครื่องที่อนุมัติแล้ว ยังต้องถูกผูกกับฟอร์มด้วยไหม */
async function allowedForForm(
  admin: NonNullable<ReturnType<typeof getAdminClient>>,
  formId: string,
  deviceId: string
): Promise<boolean> {
  const { data: f } = await admin
    .from("forms")
    .select("require_approved_device, device_scope")
    .eq("id", formId)
    .maybeSingle();
  if (!f || !f.require_approved_device) return true;
  if ((f.device_scope as string) !== "selected") return true;

  const { data: link } = await admin
    .from("form_devices")
    .select("device_id")
    .eq("form_id", formId)
    .eq("device_id", deviceId)
    .maybeSingle();
  return !!link;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * ลงทะเบียน/เช็คสถานะเครื่องปัจจุบันในองค์กรที่ล็อกอินอยู่
 * เรียกจากหน้ากรอกฟอร์มที่ล็อคเครื่อง และจากหน้าจัดการเครื่อง
 *
 * ใช้ service role เพราะคนหน้างาน (operator) ไม่มีสิทธิ์เขียนตาราง devices โดยตรง
 */
export async function registerDevice(
  deviceKey: string,
  name: string,
  platform: string,
  formId?: string
): Promise<RegisterResult | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!deviceKey || deviceKey.length < 24) return { error: "device key ไม่ถูกต้อง" };

  const admin = getAdminClient();
  if (!admin)
    return { error: "ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY — ลงทะเบียนอุปกรณ์ไม่ได้" };

  const key_hash = hashKey(deviceKey);

  const { data: existing } = await admin
    .from("devices")
    .select("id, status, name")
    .eq("tenant_id", session.tenantId)
    .eq("key_hash", key_hash)
    .maybeSingle();

  if (existing) {
    await admin.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", existing.id);
    const id = existing.id as string;
    const status = existing.status as DeviceStatus;
    return {
      deviceId: id,
      status,
      name: (existing.name as string) || "",
      allowedForForm:
        formId && status === "approved" ? await allowedForForm(admin, formId, id) : undefined,
    };
  }

  const { data, error } = await admin
    .from("devices")
    .insert({
      tenant_id: session.tenantId,
      key_hash,
      name: String(name || "").slice(0, 80).trim() || "อุปกรณ์ใหม่",
      platform: String(platform || "").slice(0, 60),
      status: "pending",
      first_user_id: session.userId,
      first_user_name: session.displayName,
    })
    .select("id, status, name")
    .single();

  if (error || !data) return { error: error?.message || "ลงทะเบียนเครื่องไม่สำเร็จ" };

  // แจ้งผู้ดูแลว่ามีเครื่องรออนุมัติ (best-effort)
  try {
    const { data: admins } = await admin
      .from("memberships")
      .select("user_id, role")
      .eq("tenant_id", session.tenantId)
      .in("role", ["owner", "admin"]);
    const rows = (admins || []).map((m) => ({
      tenant_id: session.tenantId,
      user_id: m.user_id as string,
      type: "device_pending",
      title: "📱 มีอุปกรณ์รออนุมัติ",
      body: `${(data.name as string) || "อุปกรณ์ใหม่"} — ขอใช้กรอกฟอร์มที่ล็อคเครื่อง`,
      link: "/settings/devices",
    }));
    if (rows.length) await admin.from("notifications").insert(rows);
  } catch { /* best-effort */ }

  // เครื่องใหม่ = ยังไม่อนุมัติเสมอ จึงยังไม่ต้องเช็คการผูกกับฟอร์ม
  return { deviceId: data.id as string, status: data.status as DeviceStatus, name: (data.name as string) || "" };
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type Guard = { ok: false; error: string } | { ok: true; session: KrokSession; supabase: ServerClient };

async function manageGuard(): Promise<Guard> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthorized" };
  if (session.role !== "owner" && session.role !== "admin")
    return { ok: false, error: "จัดการอุปกรณ์ได้เฉพาะ owner/admin" };
  const supabase = await createClient();
  return { ok: true, session, supabase };
}

async function audit(action: string, deviceId: string, meta: Record<string, unknown> = {}) {
  const session = await getSession();
  if (!session) return;
  const supabase = await createClient();
  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId,
    actor_id: session.userId,
    action,
    target_type: "device",
    target_id: deviceId,
    meta,
  });
}

export async function setDeviceStatus(
  id: string,
  status: DeviceStatus
): Promise<{ ok: true } | { error: string }> {
  const g = await manageGuard();
  if (!g.ok) return { error: g.error };
  if (!["pending", "approved", "revoked"].includes(status)) return { error: "สถานะไม่ถูกต้อง" };

  const patch: Record<string, unknown> = { status };
  if (status === "approved") {
    patch.approved_by = g.session.userId;
    patch.approved_at = new Date().toISOString();
  }

  const { error } = await g.supabase
    .from("devices")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", g.session.tenantId);
  if (error) return { error: error.message };

  await audit(`device.${status}`, id);
  revalidatePath("/settings/devices");
  return { ok: true };
}

export interface DeviceLink {
  id: string;
  name: string;
  platform: string;
  linked: boolean;
}

/** เครื่องที่อนุมัติแล้วทั้งหมด + ผูกกับฟอร์มนี้อยู่ไหม (ใช้ในหน้าแก้ฟอร์ม) */
export async function listDevicesForForm(formId: string): Promise<DeviceLink[]> {
  const g = await manageGuard();
  if (!g.ok) return [];

  const [{ data: devices }, { data: links }] = await Promise.all([
    g.supabase
      .from("devices")
      .select("id, name, platform")
      .eq("tenant_id", g.session.tenantId)
      .eq("status", "approved")
      .order("name", { ascending: true }),
    g.supabase.from("form_devices").select("device_id").eq("form_id", formId),
  ]);

  const linkedSet = new Set(((links || []) as { device_id: string }[]).map((l) => l.device_id));
  return ((devices || []) as Record<string, unknown>[]).map((d) => ({
    id: d.id as string,
    name: (d.name as string) || "อุปกรณ์",
    platform: (d.platform as string) || "",
    linked: linkedSet.has(d.id as string),
  }));
}

/** ตั้งว่าฟอร์มนี้รับ "ทุกเครื่องที่อนุมัติแล้ว" หรือ "เฉพาะเครื่องที่เลือก" */
export async function setFormDeviceScope(
  formId: string,
  scope: "any" | "selected"
): Promise<{ ok: true } | { error: string }> {
  const g = await manageGuard();
  if (!g.ok) return { error: g.error };
  if (scope !== "any" && scope !== "selected") return { error: "ค่าไม่ถูกต้อง" };

  const { error } = await g.supabase
    .from("forms")
    .update({ device_scope: scope })
    .eq("id", formId)
    .eq("tenant_id", g.session.tenantId)
    .eq("require_approved_device", true);
  if (error) return { error: error.message };

  await audit("form.device_scope", formId, { scope });
  revalidatePath("/settings/devices");
  revalidatePath("/studio");
  return { ok: true };
}

/** ผูก/ถอดเครื่องหนึ่งกับฟอร์มหนึ่ง */
export async function toggleFormDevice(
  formId: string,
  deviceId: string,
  linked: boolean
): Promise<{ ok: true } | { error: string }> {
  const g = await manageGuard();
  if (!g.ok) return { error: g.error };

  if (linked) {
    const { error } = await g.supabase
      .from("form_devices")
      .upsert(
        { tenant_id: g.session.tenantId, form_id: formId, device_id: deviceId, created_by: g.session.userId },
        { onConflict: "form_id,device_id" }
      );
    if (error) return { error: error.message };
  } else {
    const { error } = await g.supabase
      .from("form_devices")
      .delete()
      .eq("form_id", formId)
      .eq("device_id", deviceId)
      .eq("tenant_id", g.session.tenantId);
    if (error) return { error: error.message };
  }

  await audit(linked ? "form.device_link" : "form.device_unlink", deviceId, { form_id: formId });
  revalidatePath("/settings/devices");
  revalidatePath("/studio");
  return { ok: true };
}

export async function renameDevice(id: string, name: string): Promise<{ ok: true } | { error: string }> {
  const g = await manageGuard();
  if (!g.ok) return { error: g.error };
  const { error } = await g.supabase
    .from("devices")
    .update({ name: String(name || "").slice(0, 80).trim() || "อุปกรณ์" })
    .eq("id", id)
    .eq("tenant_id", g.session.tenantId);
  if (error) return { error: error.message };
  revalidatePath("/settings/devices");
  return { ok: true };
}

export async function deleteDevice(id: string): Promise<{ ok: true } | { error: string }> {
  const g = await manageGuard();
  if (!g.ok) return { error: g.error };
  const { error } = await g.supabase.from("devices").delete().eq("id", id).eq("tenant_id", g.session.tenantId);
  if (error) return { error: error.message };
  await audit("device.delete", id);
  revalidatePath("/settings/devices");
  return { ok: true };
}
