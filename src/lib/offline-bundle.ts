import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { rowToAttachment, type Attachment } from "@/lib/attachments";
import { resolveFormOptions, type OptionsShared } from "@/lib/datasets-server";
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
/** สร้างชุดเต็มใหม่อย่างน้อยทุก 6 ชม. แม้ลายนิ้วมือไม่เปลี่ยน (เผื่อข้อมูลอ้างอิงแก้รายแถวโดยไม่แตะตาราง datasets) */
const REBUILD_BUCKET_MS = 6 * 3600_000;

const sha = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex").slice(0, 16);

/**
 * ชุดฟอร์มออฟไลน์ · knownHash = ลายนิ้วมือที่เครื่องมีอยู่
 * ตรวจแบบเบาก่อน (ฟอร์ม/เวอร์ชัน/เอกสารแนบ/ข้อมูลอ้างอิง/แบรนด์) — ตรงกัน = ไม่ต้องดึงตัวเลือกจากข้อมูลอ้างอิงใหม่ทั้งหมด
 */
export async function buildOfflineBundle(supabase: SupabaseClient, session: KrokSession, knownHash?: string | null): Promise<OfflineBundle | "same"> {
  // รอบแรก: ข้อมูลย่อเท่านั้น (ไม่ดึง schema เต็ม) — พอสำหรับลายนิ้วมือ
  const [{ data, error }, { data: teamIdRows }, branding, { data: dsRows }] = await Promise.all([
    supabase
      .from("forms")
      .select("id, title, icon, version, requires_approval, approval_chain, require_approved_device, visibility, visible_teams, visible_users, updated_at")
      .eq("tenant_id", session.tenantId)
      .eq("status", "published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_FORMS),
    supabase.rpc("my_team_ids"),
    getWorkspaceBranding(supabase, session.tenantId),
    // ข้อมูลอ้างอิงทั้ง workspace (แถวละไม่กี่ไบต์) — เปลี่ยนเมื่อไร ลายนิ้วมือเปลี่ยน
    supabase.from("datasets").select("id, name, updated_at, active_batch, row_count, last_synced_at").eq("tenant_id", session.tenantId).order("id").limit(500),
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

  const ds = (dsRows || []) as Record<string, unknown>[];
  const fingerprint = sha({
    v: 3,
    bucket: Math.floor(Date.now() / REBUILD_BUCKET_MS),
    user: [session.userId, session.displayName, session.tenantName],
    forms: rows.map((r) => [r.id, r.version, r.updated_at, r.title, r.icon, r.requires_approval, r.require_approved_device]),
    att: [...attByForm.entries()].map(([k, v]) => [k, v.map((a) => [a.id, a.name, a.url])]),
    ds,
    branding,
  });
  if (knownHash && knownHash === fingerprint) return "same";

  // เปลี่ยนแล้ว: ดึง schema เต็มเฉพาะฟอร์มที่มองเห็น
  const schemas = new Map<string, FormSchema>();
  if (ids.length) {
    const { data: full, error: e2 } = await supabase.from("forms").select("id, schema").in("id", ids);
    if (e2) throw new Error(e2.message);
    for (const r of (full || []) as { id: string; schema: unknown }[]) {
      try {
        const sc = sanitizeSchema(r.schema);
        if (!isWorkflowSchema(sc)) schemas.set(r.id, sc);
      } catch { /* schema เสีย = ข้าม */ }
    }
  }

  // ตัวเลือกจากข้อมูลอ้างอิง: ใช้ชุดเดียวกันทุกฟอร์ม (หลายฟอร์มใช้ dataset เดียวกัน = ดึงครั้งเดียว)
  const shared: OptionsShared = { names: new Map(ds.map((d) => [d.id as string, d.name as string])), cache: new Map() };
  const todo = rows.filter((r) => schemas.has(r.id as string));
  const forms: OfflineForm[] = await Promise.all(todo.map(async (r): Promise<OfflineForm> => {
    const base = schemas.get(r.id as string)!;
    const schema = await resolveFormOptions(base, supabase, session.tenantId, shared).catch(() => base);
    return {
      formId: r.id as string,
      title: r.title as string,
      icon: r.icon as string,
      version: (r.version as number) ?? 1,
      requiresApproval: !!r.requires_approval,
      approvalChain: (r.approval_chain as unknown[]) || [],
      requireDevice: !!r.require_approved_device,
      schema,
      attachments: attByForm.get(r.id as string) || [],
    };
  }));

  return {
    hash: fingerprint,
    savedAt: new Date().toISOString(),
    tenantId: session.tenantId,
    tenantName: session.tenantName,
    userId: session.userId,
    userName: session.displayName,
    branding,
    forms,
  };
}
