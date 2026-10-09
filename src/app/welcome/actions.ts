"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, WS_COOKIE } from "@/lib/session";
import { getUserPlan, ownedTenantIds } from "@/lib/quota";
import { fmtLimit } from "@/lib/plans";

// หน้า /welcome: ผู้ใช้ที่ล็อกอินแล้วแต่ไม่มี workspace — getSession() เป็น null จึงใช้ action ใน workspace-actions ไม่ได้
const COOKIE_OPTS = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const, httpOnly: false };

async function authed() {
  const u = await getAuthUser();
  return u && !u.mfaPending ? u : null;
}

export async function welcomeCreateWorkspace(name: string): Promise<{ ok: true } | { error: string }> {
  const u = await authed();
  if (!u) return { error: "unauthorized" };
  const clean = name.trim();
  if (!clean) return { error: await sm("ต้องระบุชื่อ workspace") };
  if (clean.length > 60) return { error: await sm("ชื่อยาวเกินไป (สูงสุด 60 ตัวอักษร)") };
  const plan = await getUserPlan(u.id);
  const owned = (await ownedTenantIds(u.id))?.length ?? 0;
  if (owned >= plan.maxWorkspaces)
    return { error: `แพ็กเกจ ${plan.name} สร้าง workspace ได้สูงสุด ${fmtLimit(plan.maxWorkspaces)} (คุณเป็นเจ้าของ ${owned} แล้ว)` };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workspace", { p_name: clean });
  if (error) return { error: await sm(dbError(error)) };
  (await cookies()).set(WS_COOKIE, data as string, COOKIE_OPTS);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function welcomeAcceptInvite(id: string): Promise<{ ok: true } | { error: string }> {
  if (!(await authed())) return { error: "unauthorized" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite", { p_id: id });
  if (error) return { error: await sm(dbError(error)) };
  (await cookies()).set(WS_COOKIE, data as string, COOKIE_OPTS);
  revalidatePath("/", "layout");
  return { ok: true };
}
