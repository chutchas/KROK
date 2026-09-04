"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, listWorkspaces, WS_COOKIE } from "@/lib/session";

const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  httpOnly: false,
};

/** สลับ workspace ที่กำลังใช้งาน (ตรวจว่าผู้ใช้เป็นสมาชิกจริงก่อน) */
export async function switchWorkspace(tenantId: string): Promise<{ ok: true } | { error: string }> {
  const list = await listWorkspaces();
  if (!list.some((w) => w.tenantId === tenantId)) return { error: "ไม่พบ workspace นี้" };
  const store = await cookies();
  store.set(WS_COOKIE, tenantId, COOKIE_OPTS);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** สร้าง workspace ใหม่ (ผู้ใช้เป็น owner) แล้วสลับไปใช้ทันที */
export async function createWorkspace(name: string): Promise<{ ok: true; id: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  const clean = name.trim();
  if (!clean) return { error: "ต้องระบุชื่อ workspace" };
  if (clean.length > 60) return { error: "ชื่อยาวเกินไป (สูงสุด 60 ตัวอักษร)" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workspace", { p_name: clean });
  if (error) return { error: error.message };

  const id = data as string;
  const store = await cookies();
  store.set(WS_COOKIE, id, COOKIE_OPTS);
  revalidatePath("/", "layout");
  return { ok: true, id };
}
