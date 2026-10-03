import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSchema, type FormSchema } from "@/lib/form-schema";
import { rowToAttachment, type Attachment } from "@/lib/attachments";
import { resolveFormOptions } from "@/lib/datasets-server";
import { getWorkspaceBranding } from "@/lib/branding";
import PublicFillClient from "./PublicFillClient";
import { T } from "@/i18n/T";

export const dynamic = "force-dynamic";

export default async function PublicFillPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const admin = getAdminClient();

  const notAvailable = (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--ground)", textAlign: "center" }}>
      <div style={{ maxWidth: 360 }}>
        <div style={{ fontSize: "2rem", marginBottom: 8 }}>🔒</div>
        <h1 style={{ fontSize: "1.15rem", margin: "0 0 6px" }}><T k="fw.pubNotAvailable" /></h1>
        <p style={{ color: "var(--ink-3)", fontSize: ".9rem" }}><T k="fw.pubNotAvailableSub" /></p>
      </div>
    </main>
  );

  if (!admin) return notAvailable;

  // ฟอร์ม / เอกสารแนบ / สถานะล็อกอิน — โหลดพร้อมกัน (เดิมรอทีละตัว)
  const attP: Promise<Attachment[]> = Promise.resolve(admin
    .from("form_attachments")
    .select("id, field_id, kind, name, mime, size_bytes, url")
    .eq("form_id", formId)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true }))
    .then((r) => (r.data || []).map((x) => rowToAttachment(x as Record<string, unknown>)), () => []);
  // ผู้เปิดล็อกอินอยู่ไหม (tenant ไหนก็ได้) → แจ้งว่ากรอกในฐานะ guest · getClaims ตรวจ JWT ในเครื่อง ไม่ยิง Auth server
  const loggedInP: Promise<boolean> = createClient()
    .then((sb) => sb.auth.getClaims())
    .then((r) => !!r.data?.claims?.sub, () => false);

  const { data } = await admin
    .from("forms")
    .select("id, tenant_id, title, icon, schema, version, requires_approval, approval_chain, visibility, status, deleted_at")
    .eq("id", formId)
    .maybeSingle();

  if (!data || data.visibility !== "public" || data.status !== "published" || data.deleted_at) return notAvailable;

  // ตัวเลือกจากข้อมูลอ้างอิง: อ่านด้วย service role จึงต้องจำกัดเฉพาะ dataset ของ tenant เจ้าของฟอร์ม
  // (resolveFormOptions กรอง tenant ให้) — ค่าในคอลัมน์ที่ใช้จะมองเห็นได้โดยทุกคนที่มีลิงก์
  const raw = readSchema(data.schema);
  const [schema, attachments, loggedIn, orgName, branding] = await Promise.all([
    resolveFormOptions(raw, admin, data.tenant_id as string).catch(() => raw),
    attP,
    loggedInP,
    // ชื่อองค์กรเจ้าของฟอร์ม = ผู้ควบคุมข้อมูล (แสดงในประกาศความเป็นส่วนตัว)
    Promise.resolve(admin.from("tenants").select("name").eq("id", data.tenant_id as string).maybeSingle())
      .then((r) => (r.data?.name as string | undefined) || "", () => ""),
    getWorkspaceBranding(admin, data.tenant_id as string),
  ]);

  return (
    <PublicFillClient
      formId={data.id as string}
      title={data.title as string}
      icon={data.icon as string}
      version={(data.version as number) ?? 1}
      requiresApproval={!!data.requires_approval}
      // ฟอร์มสาธารณะ: ไม่ส่งรายชื่อผู้อนุมัติ/ผู้รับผิดชอบขั้นตอนไปให้คนนอก (server ใช้ค่าจากฟอร์มเองตอนบันทึก)
      approvalChain={[]}
      schema={{ ...schema, steps: schema.steps.map(({ assignee: _a, ...st }) => { void _a; return st; }) }}
      tenantId={data.tenant_id as string}
      loggedIn={loggedIn}
      attachments={attachments}
      orgName={orgName}
      privacyNotice={schema.privacy_notice}
      branding={branding}
    />
  );
}

/**
 * อ่าน schema จาก DB ผ่าน sanitizeSchema เสมอ
 * นอกจากกันข้อมูลเพี้ยนแล้ว ยังแปลงฟิลด์ชนิด "barcode" ของเดิม
 * ให้เป็น text + แหล่งเติมข้อมูลแบบสแกน เพื่อให้ฟอร์มเก่ายังมีปุ่มสแกนเหมือนเดิม
 */
function readSchema(raw: unknown): FormSchema {
  try {
    return sanitizeSchema(raw);
  } catch {
    return raw as FormSchema;
  }
}
