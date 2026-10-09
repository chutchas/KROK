import "server-only";
// ============================================================
// ลบบัญชีผู้ใช้แบบเก็บกวาดครบ — ใช้ร่วมกันระหว่าง "ลบบัญชีด้วยตัวเอง" (PDPA ม.33) และ "Platform Admin ลบผู้ใช้"
// กติกา: เป็น owner คนเดียวของ workspace ที่ยังมีสมาชิกคนอื่น → ต้องโอน owner ก่อน (ไม่ลบข้อมูลของทีม)
//        workspace ที่มีแค่ผู้ใช้นี้ → ลบทั้ง workspace พร้อมไฟล์
//        workspace ของคนอื่น → ออกจาก workspace (ข้อมูลที่ส่งไว้เป็นของ workspace นั้น ยังอยู่)
// ห้าม export ไฟล์นี้เป็น server action — รับ userId ตรง ๆ ต้องตรวจสิทธิ์ก่อนเรียกเสมอ
// ============================================================
import { sm } from "@/lib/server-msg";
import type { getAdminClient } from "@/lib/supabase/admin";

export type Admin = NonNullable<ReturnType<typeof getAdminClient>>;
export type DeletionPlan = {
  blockers: { tenantId: string; name: string; members: number }[];
  deleteTenants: { tenantId: string; name: string }[];
  leaveTenants: { tenantId: string; name: string }[];
  /** workspace ที่ใช้แพ็กเกจที่ผู้ใช้จ่ายอยู่ — ลบบัญชีแล้วจะเปลี่ยนเป็นแพ็กเกจของ owner คนถัดไป */
  planDrops: { tenantId: string; name: string }[];
};

export async function planDeletion(admin: Admin, userId: string): Promise<DeletionPlan> {
  const { data: mine } = await admin.from("memberships").select("tenant_id, role").eq("user_id", userId);
  const ids = ((mine || []) as { tenant_id: string; role: string }[]).map((m) => m.tenant_id);
  const plan: DeletionPlan = { blockers: [], deleteTenants: [], leaveTenants: [], planDrops: [] };
  if (!ids.length) return plan;
  const [{ data: all }, { data: tenants }] = await Promise.all([
    admin.from("memberships").select("tenant_id, user_id, role").in("tenant_id", ids),
    admin.from("tenants").select("id, name").in("id", ids),
  ]);
  const nameOf = new Map(((tenants || []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));
  for (const m of (mine || []) as { tenant_id: string; role: string }[]) {
    const others = ((all || []) as { tenant_id: string; user_id: string; role: string }[]).filter((x) => x.tenant_id === m.tenant_id && x.user_id !== userId);
    const name = nameOf.get(m.tenant_id) || "workspace";
    if (others.length === 0) plan.deleteTenants.push({ tenantId: m.tenant_id, name });
    else if (m.role === "owner" && !others.some((o) => o.role === "owner")) plan.blockers.push({ tenantId: m.tenant_id, name, members: others.length });
    else plan.leaveTenants.push({ tenantId: m.tenant_id, name });
  }
  const { data: ap } = await admin.from("account_plans").select("plan").eq("user_id", userId).maybeSingle();
  if (ap?.plan && ap.plan !== "free") {
    const owned = await Promise.all(plan.leaveTenants.map(async (t) => {
      const { data: b } = await admin.rpc("tenant_billing_owner", { p_tenant: t.tenantId });
      return b === userId ? t : null;
    }));
    plan.planDrops = owned.filter((t): t is { tenantId: string; name: string } => !!t);
  }
  return plan;
}

/** path ไฟล์ทั้งหมดของ workspace (อ่านจากตารางที่อ้างอิงไฟล์ — ไม่ต้องไล่ list storage ทีละโฟลเดอร์) */
async function tenantFiles(admin: Admin, tenantId: string): Promise<{ submissions: string[]; attachments: string[]; drafts: string[] }> {
  const [ph, dx, at, dr] = await Promise.all([
    admin.from("submission_photos").select("storage_path").eq("tenant_id", tenantId).limit(100000),
    admin.from("submission_doc_extracts").select("storage_path").eq("tenant_id", tenantId).limit(100000),
    admin.from("form_attachments").select("storage_path").eq("tenant_id", tenantId).limit(100000),
    admin.from("submission_drafts").select("media").eq("tenant_id", tenantId).limit(100000),
  ]);
  const own = (p: unknown): p is string => typeof p === "string" && p.startsWith(`${tenantId}/`) && !p.includes("..");
  return {
    submissions: [...(ph.data || []), ...(dx.data || [])].map((r) => (r as { storage_path: unknown }).storage_path).filter(own),
    attachments: (at.data || []).map((r) => (r as { storage_path: unknown }).storage_path).filter(own),
    drafts: (dr.data || []).flatMap((r) => Object.values(((r as { media: unknown }).media || {}) as Record<string, unknown>)).filter(own),
  };
}

async function removeAll(admin: Admin, bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 900) await admin.storage.from(bucket).remove(paths.slice(i, i + 900));
}

/**
 * ลบผู้ใช้ตามแผน (ลบแล้วกู้คืนไม่ได้)
 * actorId = ผู้สั่งลบ (ตัวเอง หรือ platform admin) · by = ใส่ใน audit_log ว่าใครเป็นคนลบ
 */
export async function executeDeletion(
  admin: Admin,
  target: { userId: string; email: string },
  actor: { actorId: string; by: "self" | "platform_admin" },
): Promise<{ ok: true; plan: DeletionPlan } | { error: string; blockers?: DeletionPlan["blockers"] }> {
  const { userId, email } = target;
  const plan = await planDeletion(admin, userId);
  if (plan.blockers.length) return { error: await sm("ต้องโอน owner ของ workspace ที่ยังมีสมาชิกก่อน"), blockers: plan.blockers };

  // บันทึกใน workspace ที่ยังอยู่ต่อ (ใครออกไป เมื่อไร) — ก่อนลบ user
  if (plan.leaveTenants.length)
    await admin.from("audit_log").insert(plan.leaveTenants.map((t) => ({
      tenant_id: t.tenantId, actor_id: actor.actorId, action: "account.delete", target_type: "user", target_id: userId,
      meta: { email, by: actor.by },
    })));

  // workspace ที่มีแค่ผู้ใช้นี้: ลบไฟล์ แล้วลบ workspace (ข้อมูลในตารางลบตาม cascade)
  for (const t of plan.deleteTenants) {
    // ใบแจ้งหนี้เก็บไว้ตามกฎหมาย (0051: tenant_id → null) — ยังไม่รัน 0051 = หยุด ไม่ให้ใบแจ้งหนี้หายตาม workspace
    const { count: invCount } = await admin.from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", t.tenantId);
    if (invCount) {
      const { error: detachErr } = await admin.from("invoices").update({ tenant_id: null }).eq("tenant_id", t.tenantId);
      if (detachErr) return { error: await sm("ระบบยังไม่พร้อมลบ workspace ที่มีใบแจ้งหนี้ (ผู้ดูแลต้องรัน migration 0051)") };
    }
    const files = await tenantFiles(admin, t.tenantId);
    await removeAll(admin, "submissions", files.submissions);
    await removeAll(admin, "attachments", files.attachments);
    await removeAll(admin, "drafts", files.drafts);
    const { error } = await admin.from("tenants").delete().eq("id", t.tenantId);
    if (error) return { error: `ลบ workspace “${t.name}” ไม่สำเร็จ: ${error.message}` };
  }

  // รูปโปรไฟล์ + ร่างของผู้ใช้ใน workspace อื่น
  const { data: av } = await admin.storage.from("avatars").list(userId);
  if (av?.length) await admin.storage.from("avatars").remove(av.map((f) => `${userId}/${f.name}`));
  const { data: myDrafts } = await admin.from("submission_drafts").select("media").eq("user_id", userId);
  const draftPaths = (myDrafts || []).flatMap((r) => Object.values(((r as { media: unknown }).media || {}) as Record<string, unknown>))
    .filter((p): p is string => typeof p === "string" && p.split("/")[1] === userId && !p.includes(".."));
  await removeAll(admin, "drafts", draftPaths);

  // ลบผู้ใช้ — สมาชิกภาพ/โปรไฟล์/แพ็กเกจ/บัตรที่ผูกไว้ลบตาม cascade · ข้อมูลที่ส่งใน workspace อื่นเหลือแต่ไม่ผูกบัญชี
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return { error: `ลบบัญชีไม่สำเร็จ: ${delErr.message}` };
  return { ok: true, plan };
}
