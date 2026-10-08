"use server";
// ============================================================
// KROK · พื้นที่ (Area) ของ workspace — รายชื่อกลางที่ฟิลด์พื้นที่ในฟอร์มดึงไปใช้ (0072)
// รหัสเปลี่ยนไม่ได้หลังสร้าง (คำตอบเก่าอ้างด้วยรหัส) · ไม่มีลบ: ปิดใช้แทน
// ============================================================
import { revalidatePath } from "next/cache";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { writeAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { getSession, type KrokSession } from "@/lib/session";
import { AREA_CODE_RE } from "@/lib/form-schema";
import type { AreaRow, OpenItem } from "@/lib/areas";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id, code, name, sort, active";

const missingTable = (m: string) => /workspace_areas|area_open_items/.test(m) && /does not exist|schema cache|not find/i.test(m);

async function requireAdmin(): Promise<{ ok: true; session: KrokSession } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthorized" };
  if (session.role !== "owner" && session.role !== "admin") return { ok: false, error: await sm("เฉพาะ owner/admin เท่านั้น") };
  return { ok: true, session };
}

/** รายชื่อพื้นที่ของ workspace ที่เปิดอยู่ (สมาชิกทุกคนอ่านได้ — ใช้ใน Studio / dashboard) */
export async function listAreas(includeInactive = false): Promise<{ areas: AreaRow[] } | { error: string; missing?: boolean }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  const supabase = await createClient();
  let q = supabase.from("workspace_areas").select(COLS).eq("tenant_id", session.tenantId).order("sort").order("name");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) return missingTable(error.message || "") ? { error: await sm("ยังไม่ได้รัน migration 0072"), missing: true } : { error: await sm(dbError(error)) };
  return { areas: (data || []) as AreaRow[] };
}

export async function createArea(code: string, name: string): Promise<{ ok: true; area: AreaRow } | { error: string }> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  const c = String(code ?? "").trim();
  const n = String(name ?? "").trim();
  if (!AREA_CODE_RE.test(c)) return { error: await sm("รหัสพื้นที่ต้องยาว 1–20 ตัว ไม่มีช่องว่างหรือจุลภาค") };
  if (!n || n.length > 80) return { error: await sm("ชื่อพื้นที่ต้องยาว 1–80 ตัวอักษร") };

  const supabase = await createClient();
  const { data: last } = await supabase.from("workspace_areas").select("sort").eq("tenant_id", a.session.tenantId).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("workspace_areas")
    .insert({ tenant_id: a.session.tenantId, code: c, name: n, sort: ((last?.sort as number | undefined) ?? -1) + 1 })
    .select(COLS)
    .single();
  if (error) {
    if (error.code === "23505") return { error: await sm("มีรหัสพื้นที่นี้แล้ว") };
    return { error: await sm(dbError(error)) };
  }
  await writeAudit({ tenant_id: a.session.tenantId, actor_id: a.session.userId, action: "area.create", target_type: "area", target_id: data.id as string, meta: { code: c, name: n } });
  revalidatePath("/settings/areas");
  return { ok: true, area: data as AreaRow };
}

/** แก้ชื่อ / เปิด-ปิดใช้ (รหัสแก้ไม่ได้) */
export async function updateArea(id: string, patch: { name?: string; active?: boolean }): Promise<{ ok: true } | { error: string }> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  if (!UUID_RE.test(id)) return { error: "bad id" };
  const row: { name?: string; active?: boolean } = {};
  if (typeof patch.name === "string") {
    const n = patch.name.trim();
    if (!n || n.length > 80) return { error: await sm("ชื่อพื้นที่ต้องยาว 1–80 ตัวอักษร") };
    row.name = n;
  }
  if (typeof patch.active === "boolean") row.active = patch.active;
  if (!Object.keys(row).length) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("workspace_areas").update(row).eq("id", id).eq("tenant_id", a.session.tenantId);
  if (error) return { error: await sm(dbError(error)) };
  await writeAudit({ tenant_id: a.session.tenantId, actor_id: a.session.userId, action: "area.update", target_type: "area", target_id: id, meta: row });
  revalidatePath("/settings/areas");
  return { ok: true };
}

/** เรียงลำดับใหม่ตามรายการ id ที่ส่งมา */
export async function reorderAreas(ids: string[]): Promise<{ ok: true } | { error: string }> {
  const a = await requireAdmin();
  if (!a.ok) return { error: a.error };
  const list = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string" && UUID_RE.test(x)).slice(0, 200);
  const supabase = await createClient();
  const results = await Promise.all(
    list.map((id, i) => supabase.from("workspace_areas").update({ sort: i }).eq("id", id).eq("tenant_id", a.session.tenantId))
  );
  const bad = results.find((r) => r.error);
  if (bad?.error) return { error: await sm(dbError(bad.error)) };
  revalidatePath("/settings/areas");
  return { ok: true };
}

/**
 * ใบอื่นที่ยังไม่จบในพื้นที่เดียวกัน (เตือนอย่างเดียว ไม่บล็อก) — ใช้ในหัวงาน
 * เห็นเฉพาะฟอร์มที่ตัวเองมองเห็นได้ (RPC กรองให้)
 */
export async function areaOpenOthers(areaId: string, excludeId: string): Promise<{ name: string; items: OpenItem[] } | null> {
  const session = await getSession();
  if (!session || !UUID_RE.test(areaId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("area_open_items", { p_tenant: session.tenantId, p_area: areaId });
  if (error) return null;
  const rows = (data || []) as OpenItem[];
  const name = rows[0]?.area_name ?? "";
  return { name, items: rows.filter((r) => r.id !== excludeId) };
}
