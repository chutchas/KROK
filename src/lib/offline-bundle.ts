import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { rowToAttachment, type Attachment } from "@/lib/attachments";
import { resolveFormOptions } from "@/lib/datasets-server";
import { isWorkflowSchema } from "@/lib/case-flow";
import { getWorkspaceBranding } from "@/lib/branding";
import { canManage, type KrokSession } from "@/lib/session";
import type { OfflineBundle, OfflineForm } from "@/lib/offline-types";

// ============================================================
// ชุดฟอร์มสำหรับกรอกออฟไลน์ — ทุกฟอร์มที่ผู้ใช้เห็นได้ใน workspace ปัจจุบัน
// (กติกาการมองเห็นเดียวกับหน้า "กรอกฟอร์ม") พร้อมตัวเลือกจากข้อมูลอ้างอิงรอบล่าสุด
// ไม่รวมฟอร์มกรอกหลายคน (ต้องออนไลน์เพื่อรับ/ส่งต่องาน)
// ============================================================

const MAX_FORMS = 150;

export async function buildOfflineBundle(supabase: SupabaseClient, session: KrokSession): Promise<OfflineBundle> {
  const [{ data, error }, { data: teamIdRows }, branding] = await Promise.all([
    supabase
      .from("forms")
      .select("id, title, icon, schema, version, requires_approval, approval_chain, require_approved_device, visibility, visible_teams, visible_users, updated_at")
      .eq("tenant_id", session.tenantId)
      .eq("status", "published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_FORMS),
    supabase.rpc("my_team_ids"),
    getWorkspaceBranding(supabase, session.tenantId),
  ]);
  if (error) throw new Error(error.message);

  const myTeams = new Set(((teamIdRows as string[] | null) || []).map(String));
  const manager = canManage(session.role);
  const rows = ((data || []) as Record<string, unknown>[]).filter((f) => {
    if (manager) return true;
    const mode = (f.visibility as string) ?? "all";
    if (mode === "teams") return ((f.visible_teams as string[]) || []).some((t) => myTeams.has(String(t)));
    if (mode === "users") return ((f.visible_users as string[]) || []).includes(session.userId);
    return true;
  });

  const ids = rows.map((r) => r.id as string);
  const attByForm = new Map<string, Attachment[]>();
  if (ids.length) {
    try {
      const { data: att } = await supabase
        .from("form_attachments")
        .select("id, form_id, field_id, kind, name, mime, size_bytes, url")
        .in("form_id", ids)
        .order("sort", { ascending: true });
      for (const a of (att || []) as Record<string, unknown>[]) {
        const k = a.form_id as string;
        attByForm.set(k, [...(attByForm.get(k) || []), rowToAttachment(a)]);
      }
    } catch { /* ไม่มีตาราง = ไม่มีเอกสารแนบ */ }
  }

  const forms: OfflineForm[] = [];
  for (const r of rows) {
    let schema: FormSchema;
    try { schema = sanitizeSchema(r.schema); } catch { continue; }
    if (isWorkflowSchema(schema)) continue;
    schema = await resolveFormOptions(schema, supabase, session.tenantId).catch(() => schema);
    forms.push({
      formId: r.id as string,
      title: r.title as string,
      icon: r.icon as string,
      version: (r.version as number) ?? 1,
      requiresApproval: !!r.requires_approval,
      approvalChain: (r.approval_chain as unknown[]) || [],
      requireDevice: !!r.require_approved_device,
      schema,
      attachments: attByForm.get(r.id as string) || [],
    });
  }

  const body = { forms, branding };
  const hash = createHash("sha1").update(JSON.stringify(body)).digest("hex").slice(0, 16);
  return {
    hash,
    savedAt: new Date().toISOString(),
    tenantId: session.tenantId,
    tenantName: session.tenantName,
    userId: session.userId,
    userName: session.displayName,
    ...body,
  };
}
