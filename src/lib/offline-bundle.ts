import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { datasetIdsOf, sanitizeSchema, type FormSchema } from "@/lib/form-schema";
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
/** สร้างชุดเต็มใหม่อย่างน้อยทุก 6 ชม. แม้ลายนิ้วมือไม่เปลี่ยน (เผื่อข้อมูลอ้างอิงแก้รายแถวโดยไม่แตะตาราง datasets) */
const REBUILD_BUCKET_MS = 6 * 3600_000;

const sha = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex").slice(0, 16);

/**
 * ชุดฟอร์มออฟไลน์ · knownHash = ลายนิ้วมือที่เครื่องมีอยู่
 * ตรวจแบบเบาก่อน (ฟอร์ม/เวอร์ชัน/เอกสารแนบ/ข้อมูลอ้างอิง/แบรนด์) — ตรงกัน = ไม่ต้องดึงตัวเลือกจากข้อมูลอ้างอิงใหม่ทั้งหมด
 */
export async function buildOfflineBundle(supabase: SupabaseClient, session: KrokSession, knownHash?: string | null): Promise<OfflineBundle | "same"> {
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

  // ---- ลายนิ้วมือแบบเบา ----
  const schemas = new Map<string, FormSchema>();
  for (const r of rows) {
    try {
      const sc = sanitizeSchema(r.schema);
      if (!isWorkflowSchema(sc)) schemas.set(r.id as string, sc);
    } catch { /* schema เสีย = ข้าม */ }
  }
  const dsIds = [...new Set([...schemas.values()].flatMap((sc) => datasetIdsOf(sc)))];
  let dsMeta: unknown[] = [];
  if (dsIds.length) {
    const { data: ds } = await supabase.from("datasets").select("id, updated_at, active_batch, row_count, last_synced_at").in("id", dsIds);
    dsMeta = ((ds || []) as Record<string, unknown>[]).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  const fingerprint = sha({
    v: 2,
    bucket: Math.floor(Date.now() / REBUILD_BUCKET_MS),
    user: [session.userId, session.displayName, session.tenantName],
    forms: rows.filter((r) => schemas.has(r.id as string)).map((r) => [r.id, r.version, r.updated_at, r.title, r.icon, r.requires_approval, r.require_approved_device]),
    att: [...attByForm.entries()].map(([k, v]) => [k, v.map((a) => [a.id, a.name, a.url])]),
    ds: dsMeta,
    branding,
  });
  if (knownHash && knownHash === fingerprint) return "same";

  // ดึงตัวเลือกจากข้อมูลอ้างอิงทีละ 6 ฟอร์มพร้อมกัน (ไม่ยิงฐานข้อมูลรัวทีเดียวทั้งหมด)
  const todo = rows.filter((r) => schemas.has(r.id as string));
  const forms: OfflineForm[] = [];
  for (let i = 0; i < todo.length; i += 6) {
    const batch = await Promise.all(todo.slice(i, i + 6).map(async (r): Promise<OfflineForm> => {
      const base = schemas.get(r.id as string)!;
      const schema = await resolveFormOptions(base, supabase, session.tenantId).catch(() => base);
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
    forms.push(...batch);
  }

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
