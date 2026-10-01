"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, type KrokSession } from "@/lib/session";
import { canAddMember } from "@/lib/quota";
import { fmtLimit } from "@/lib/plans";
import { sendEmail, inviteEmail } from "@/lib/email";
import { siteOrigin } from "@/lib/site-origin";

type Role = "owner" | "admin" | "designer" | "operator";
const ROLES: Role[] = ["owner", "admin", "designer", "operator"];

type AdminGate = { ok: true; session: KrokSession } | { ok: false; error: string };

async function requireAdmin(): Promise<AdminGate> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthorized" };
  if (session.role !== "owner" && session.role !== "admin")
    return { ok: false, error: "เฉพาะ owner/admin เท่านั้น" };
  return { ok: true, session };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type InviteResult =
  | { ok: true; link: string; emailed: boolean; emailError?: string; notConfigured?: boolean }
  | { error: string };

/** ลิงก์ในอีเมลเชิญ: หน้าสมัครที่กรอกอีเมลไว้ให้ (มีบัญชีแล้ว = เข้าสู่ระบบแล้วกดเข้าร่วมที่แถบด้านบน) */
async function inviteLink(email: string) {
  return `${await siteOrigin()}/login?invite=${encodeURIComponent(email)}`;
}

/** ส่งอีเมลเชิญ (ล้มเหลวไม่ทำให้คำเชิญหาย — คืน error ให้หน้าจอแจ้งและให้คัดลอกลิงก์ส่งเองได้) */
async function sendInviteMail(supabase: Awaited<ReturnType<typeof createClient>>, session: KrokSession, inv: { email: string; role_key: string | null; team_ids: string[] | null }) {
  const [{ data: role }, { data: teamRows }] = await Promise.all([
    supabase.from("tenant_roles").select("name").eq("tenant_id", session.tenantId).eq("key", inv.role_key || "user").maybeSingle(),
    inv.team_ids?.length ? supabase.from("teams").select("name").eq("tenant_id", session.tenantId).in("id", inv.team_ids) : Promise.resolve({ data: [] as { name: string }[] }),
  ]);
  const link = await inviteLink(inv.email);
  const mail = inviteEmail({
    workspace: session.tenantName,
    inviter: session.displayName || "ผู้ดูแล",
    role: (role?.name as string) || inv.role_key || "User",
    teams: ((teamRows || []) as { name: string }[]).map((t) => t.name),
    link,
  });
  const sent = await sendEmail({ to: inv.email, ...mail });
  return { link, sent };
}

// เชิญสมาชิกด้วย role_key (รองรับ custom role) — เก็บทั้ง role_key และ enum role (สำรอง/ความปลอดภัย)
// teamIds (ไม่บังคับ): ทีม/แผนกที่จะใส่ให้อัตโนมัติเมื่อรับคำเชิญ · แล้วส่งอีเมลเชิญผ่าน Resend
export async function inviteMember(email: string, roleKey: string, teamIds: string[] = []): Promise<InviteResult> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  const { session } = a;
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { error: "อีเมลไม่ถูกต้อง" };

  const supabase = await createClient();
  const { data: roleDef } = await supabase
    .from("tenant_roles").select("key, can_manage").eq("tenant_id", session.tenantId).eq("key", roleKey).maybeSingle();
  if (!roleDef) return { error: "ไม่พบ role นี้" };
  if (roleKey === "owner" && session.role !== "owner") return { error: "เฉพาะ owner เชิญ owner ได้" };

  // enum role (ชั้นความปลอดภัย/RLS) จาก can_manage
  const role: Role = roleKey === "owner" ? "owner" : roleDef.can_manage ? "admin" : "operator";

  const q = await canAddMember(session.tenantId);
  if (!q.ok)
    return { error: `แผนปัจจุบันมีสมาชิกได้สูงสุด ${fmtLimit(q.max)} คน (ปัจจุบัน ${q.used}) — อัปเกรดแผนที่หน้า “แผน/โควตา”` };

  // ทีมต้องเป็นของ workspace นี้ (กรองทิ้งที่ไม่ใช่)
  let teams: string[] = [];
  const wanted = Array.from(new Set(teamIds.filter((x) => typeof x === "string" && UUID_RE.test(x)))).slice(0, 50);
  if (wanted.length) {
    const { data: rows } = await supabase.from("teams").select("id").eq("tenant_id", session.tenantId).in("id", wanted);
    teams = ((rows || []) as { id: string }[]).map((r) => r.id);
  }

  // เป็นสมาชิกอยู่แล้ว → ไม่ต้องเชิญ
  const { data: already } = await supabase.from("memberships").select("user_id").eq("tenant_id", session.tenantId).ilike("email", clean.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (already) return { error: "อีเมลนี้เป็นสมาชิกของ workspace นี้อยู่แล้ว" };

  const { error } = await supabase
    .from("invites")
    .upsert(
      { tenant_id: session.tenantId, email: clean, role, role_key: roleKey, team_ids: teams, invited_by: session.userId, accepted_at: null },
      { onConflict: "tenant_id,email" }
    );
  if (error) return { error: error.message };

  const { link, sent } = await sendInviteMail(supabase, session, { email: clean, role_key: roleKey, team_ids: teams });
  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId, actor_id: session.userId,
    action: "member.invite", target_type: "invite",
    meta: { email: clean, role_key: roleKey, teams: teams.length, emailed: sent.ok, ...(sent.ok ? { email_id: sent.id } : { email_error: sent.error }) },
  });
  revalidatePath("/settings/team");
  return sent.ok ? { ok: true, link, emailed: true } : { ok: true, link, emailed: false, emailError: sent.error, notConfigured: sent.notConfigured };
}

/** ส่งอีเมลเชิญซ้ำ (คำเชิญที่ยังไม่รับ) */
export async function resendInvite(id: string): Promise<InviteResult> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("invites").select("email, role_key, team_ids").eq("id", id).eq("tenant_id", a.session.tenantId).is("accepted_at", null).maybeSingle();
  if (!inv) return { error: "ไม่พบคำเชิญนี้ หรือมีคนรับไปแล้ว" };
  const { link, sent } = await sendInviteMail(supabase, a.session, inv as { email: string; role_key: string | null; team_ids: string[] | null });
  await supabase.from("audit_log").insert({
    tenant_id: a.session.tenantId, actor_id: a.session.userId,
    action: "member.invite_resend", target_type: "invite", target_id: id,
    meta: { email: inv.email, emailed: sent.ok, ...(sent.ok ? { email_id: sent.id } : { email_error: sent.error }) },
  });
  return sent.ok ? { ok: true, link, emailed: true } : { ok: true, link, emailed: false, emailError: sent.error, notConfigured: sent.notConfigured };
}

export async function cancelInvite(id: string): Promise<{ ok: true } | { error: string }> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  const supabase = await createClient();
  const { error } = await supabase.from("invites").delete().eq("id", id).eq("tenant_id", a.session.tenantId);
  if (error) return { error: error.message };
  revalidatePath("/settings/team");
  return { ok: true };
}

// กำหนด role ให้สมาชิกด้วย role_key (รองรับ role ที่สร้างเอง)
export async function changeRoleKey(userId: string, roleKey: string): Promise<{ ok: true } | { error: string }> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  const { session } = a;
  const supabase = await createClient();

  const { data: roleDef } = await supabase
    .from("tenant_roles").select("key, can_manage").eq("tenant_id", session.tenantId).eq("key", roleKey).maybeSingle();
  if (!roleDef) return { error: "ไม่พบ role นี้" };

  const isOwnerRole = roleKey === "owner";
  if (isOwnerRole && session.role !== "owner") return { error: "เฉพาะ owner ตั้ง owner ได้" };

  // กัน owner คนสุดท้ายหลุด
  if (!isOwnerRole) {
    const { data: target } = await supabase
      .from("memberships").select("role").eq("tenant_id", session.tenantId).eq("user_id", userId).maybeSingle();
    if (target?.role === "owner") {
      const { count } = await supabase
        .from("memberships").select("id", { count: "exact", head: true })
        .eq("tenant_id", session.tenantId).eq("role", "owner");
      if ((count ?? 0) <= 1) return { error: "ต้องมี owner อย่างน้อย 1 คน" };
    }
  }

  // sync enum role (ชั้นความปลอดภัย) ตาม can_manage
  const enumRole: Role = isOwnerRole ? "owner" : roleDef.can_manage ? "admin" : "operator";
  const { error } = await supabase
    .from("memberships").update({ role: enumRole, role_key: roleKey })
    .eq("tenant_id", session.tenantId).eq("user_id", userId);
  if (error) return { error: error.message };
  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId, actor_id: session.userId,
    action: "member.role_change", target_type: "user", target_id: userId, meta: { role_key: roleKey },
  });
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function changeRole(userId: string, role: Role): Promise<{ ok: true } | { error: string }> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  const { session } = a;
  if (!ROLES.includes(role)) return { error: "role ไม่ถูกต้อง" };
  if (role === "owner" && session.role !== "owner") return { error: "เฉพาะ owner ตั้ง owner ได้" };

  const supabase = await createClient();
  // กันเปลี่ยน owner คนสุดท้ายให้กลายเป็น role อื่น
  if (role !== "owner") {
    const { data: target } = await supabase
      .from("memberships").select("role").eq("tenant_id", session.tenantId).eq("user_id", userId).maybeSingle();
    if (target?.role === "owner") {
      const { count } = await supabase
        .from("memberships").select("id", { count: "exact", head: true })
        .eq("tenant_id", session.tenantId).eq("role", "owner");
      if ((count ?? 0) <= 1) return { error: "ต้องมี owner อย่างน้อย 1 คน" };
    }
  }

  const { error } = await supabase
    .from("memberships").update({ role }).eq("tenant_id", session.tenantId).eq("user_id", userId);
  if (error) return { error: error.message };
  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId, actor_id: session.userId,
    action: "member.role_change", target_type: "user", target_id: userId, meta: { role },
  });
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function removeMember(userId: string): Promise<{ ok: true } | { error: string }> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  const { session } = a;
  if (userId === session.userId) return { error: "ลบตัวเองไม่ได้" };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("memberships").select("role").eq("tenant_id", session.tenantId).eq("user_id", userId).maybeSingle();
  if (target?.role === "owner" && session.role !== "owner")
    return { error: "เฉพาะ owner ลบ owner ได้" };

  const { error } = await supabase
    .from("memberships").delete().eq("tenant_id", session.tenantId).eq("user_id", userId);
  if (error) return { error: error.message };
  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId, actor_id: session.userId,
    action: "member.remove", target_type: "user", target_id: userId,
  });
  revalidatePath("/settings/team");
  return { ok: true };
}

// ============================================================
// Teams / Sections (กลุ่มย่อยในองค์กร)
// ============================================================

export async function createTeam(name: string): Promise<{ ok: true } | { error: string }> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  const { session } = a;
  const clean = name.trim();
  if (!clean) return { error: "ต้องระบุชื่อทีม" };
  if (clean.length > 60) return { error: "ชื่อยาวเกินไป" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("teams")
    .insert({ tenant_id: session.tenantId, name: clean, created_by: session.userId });
  if (error) return { error: error.message };
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function renameTeam(teamId: string, name: string): Promise<{ ok: true } | { error: string }> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  const clean = name.trim();
  if (!clean) return { error: "ต้องระบุชื่อทีม" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("teams").update({ name: clean }).eq("id", teamId).eq("tenant_id", a.session.tenantId);
  if (error) return { error: error.message };
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function deleteTeam(teamId: string): Promise<{ ok: true } | { error: string }> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("teams").delete().eq("id", teamId).eq("tenant_id", a.session.tenantId);
  if (error) return { error: error.message };
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function setTeamMembers(teamId: string, userIds: string[]): Promise<{ ok: true } | { error: string }> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  const { session } = a;

  const supabase = await createClient();
  // ยืนยันว่า team อยู่ใน tenant นี้
  const { data: team } = await supabase
    .from("teams").select("id").eq("id", teamId).eq("tenant_id", session.tenantId).maybeSingle();
  if (!team) return { error: "ไม่พบทีม" };

  // ยืนยันว่า userIds เป็นสมาชิกของ tenant จริง
  const { data: mem } = await supabase
    .from("memberships").select("user_id").eq("tenant_id", session.tenantId);
  const valid = new Set((mem || []).map((m) => m.user_id as string));
  const clean = Array.from(new Set(userIds.filter((u) => valid.has(u))));

  const { error: delErr } = await supabase.from("team_members").delete().eq("team_id", teamId);
  if (delErr) return { error: delErr.message };
  if (clean.length > 0) {
    const rows = clean.map((user_id) => ({ team_id: teamId, user_id, tenant_id: session.tenantId }));
    const { error: insErr } = await supabase.from("team_members").insert(rows);
    if (insErr) return { error: insErr.message };
  }
  revalidatePath("/settings/team");
  return { ok: true };
}
