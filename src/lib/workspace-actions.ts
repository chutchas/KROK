"use server";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, getSignedInUser, listWorkspaces, WS_COOKIE } from "@/lib/session";
import { getUserPlan, ownedTenantIds } from "@/lib/quota";
import { fmtLimit } from "@/lib/plans";

const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  httpOnly: false,
};

/** สลับ workspace ที่กำลังใช้งาน (ตรวจว่าผู้ใช้เป็นสมาชิกจริงก่อน) */
export async function switchWorkspace(tenantId: string): Promise<{ ok: true } | { error: string }> {
  const list = await listWorkspaces();
  if (!list.some((w) => w.tenantId === tenantId)) return { error: await sm("ไม่พบ workspace นี้") };
  const store = await cookies();
  store.set(WS_COOKIE, tenantId, COOKIE_OPTS);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** สร้าง workspace ใหม่ (ผู้ใช้เป็น owner) แล้วสลับไปใช้ทันที */
export async function createWorkspace(name: string): Promise<{ ok: true; id: string } | { error: string }> {
  // ผู้ใช้ที่ยังไม่มี workspace (หน้า /welcome) สร้างได้ด้วย — ต้องล็อกอินและผ่าน 2FA แล้ว
  const session = await getSession();
  const me = await getSignedInUser();
  if (!me || me.mfaPending) return { error: "unauthorized" };
  const clean = name.trim();
  if (!clean) return { error: await sm("ต้องระบุชื่อ workspace") };
  if (clean.length > 60) return { error: await sm("ชื่อยาวเกินไป (สูงสุด 60 ตัวอักษร)") };

  // จำกัดจำนวน workspace ตามแพ็กเกจของบัญชีผู้ใช้ (workspace ใหม่ใช้แพ็กเกจเดียวกันและนับโควตารวม)
  const plan = await getUserPlan(me.id, session?.tenantId);
  const owned = (await ownedTenantIds(me.id))?.length ?? (await listWorkspaces()).filter((w) => w.role === "owner").length;
  if (owned >= plan.maxWorkspaces)
    return { error: `แพ็กเกจ ${plan.name} สร้าง workspace ได้สูงสุด ${fmtLimit(plan.maxWorkspaces)} (คุณเป็นเจ้าของ ${owned} แล้ว) — อัปเกรดแพ็กเกจเพื่อเพิ่ม` };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workspace", { p_name: clean });
  if (error) return { error: await sm(dbError(error)) };

  const id = data as string;
  const store = await cookies();
  store.set(WS_COOKIE, id, COOKIE_OPTS);
  revalidatePath("/", "layout");
  return { ok: true, id };
}

export interface PendingInvite { id: string; tenant_id: string; tenant_name: string; role_name: string; invited_by_name: string | null }

/** คำเชิญที่ค้างอยู่ของผู้ใช้ที่ล็อกอิน (มีบัญชีอยู่แล้วตอนถูกเชิญ) — ยังไม่รัน migration 0039 = คืนว่าง */
export async function myPendingInvites(): Promise<PendingInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_pending_invites");
  if (error || !Array.isArray(data)) return [];
  return data as PendingInvite[];
}

/** รับคำเชิญ → เข้า workspace นั้นและสลับไปใช้ทันที */
export async function acceptInvite(id: string): Promise<{ ok: true } | { error: string }> {
  const me = await getSignedInUser();
  if (!me || me.mfaPending) return { error: "unauthorized" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite", { p_id: id });
  if (error) return { error: await sm(dbError(error)) };
  const store = await cookies();
  store.set(WS_COOKIE, data as string, COOKIE_OPTS);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function declineInvite(id: string): Promise<{ ok: true } | { error: string }> {
  const me = await getSignedInUser();
  if (!me || me.mfaPending) return { error: "unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_invite", { p_id: id });
  if (error) return { error: await sm(dbError(error)) };
  revalidatePath("/", "layout");
  return { ok: true };
}
