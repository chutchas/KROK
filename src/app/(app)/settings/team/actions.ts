"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, type KrokSession } from "@/lib/session";
import { canAddMember } from "@/lib/quota";
import { fmtLimit } from "@/lib/plans";

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

export async function inviteMember(email: string, role: Role): Promise<{ ok: true } | { error: string }> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  const { session } = a;
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { error: "อีเมลไม่ถูกต้อง" };
  if (!ROLES.includes(role)) return { error: "role ไม่ถูกต้อง" };
  if (role === "owner" && session.role !== "owner") return { error: "เฉพาะ owner เชิญ owner ได้" };

  const q = await canAddMember(session.tenantId);
  if (!q.ok)
    return { error: `แผนปัจจุบันมีสมาชิกได้สูงสุด ${fmtLimit(q.max)} คน (ปัจจุบัน ${q.used}) — อัปเกรดแผนที่หน้า “แผน/โควตา”` };

  const supabase = await createClient();
  const { error } = await supabase
    .from("invites")
    .upsert(
      { tenant_id: session.tenantId, email: clean, role, invited_by: session.userId, accepted_at: null },
      { onConflict: "tenant_id,email" }
    );
  if (error) return { error: error.message };
  await supabase.from("audit_log").insert({
    tenant_id: session.tenantId, actor_id: session.userId,
    action: "member.invite", target_type: "invite", meta: { email: clean, role },
  });
  revalidatePath("/settings/team");
  return { ok: true };
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
