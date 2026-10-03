import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";

export interface AuditRow {
  tenant_id: string;
  actor_id: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * บันทึก audit log จากฝั่ง server เท่านั้น (0057 ปิดไม่ให้ผู้ใช้ insert ตรง — กันปลอมประวัติ)
 * เรียกหลังตรวจสิทธิ์แล้ว · ล้มเหลว = ไม่ขัดงานหลัก
 */
export async function writeAudit(row: AuditRow): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;
  try {
    await admin.from("audit_log").insert(row);
  } catch {
    /* audit ล้มเหลวไม่ทำให้คำสั่งหลักล้ม */
  }
}
