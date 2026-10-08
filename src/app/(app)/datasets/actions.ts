"use server";
import { sm } from "@/lib/server-msg";
import { dbError } from "@/lib/db-error";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getSession, canManage, type KrokSession } from "@/lib/session";
import {
  DATASET_SELECT,
  MAX_DATASETS_PER_TENANT,
  SCHEDULE_MINUTES,
  columnsFromPaths,
  getPath,
  inferFieldPaths,
  isValidColumnKey,
  rowToMeta,
  sanitizeColumns,
  type DatasetColumn,
  type DatasetMeta,
  type DatasetSourceKind,
  type DatasetSyncMode,
  type PullConfig,
} from "@/lib/datasets";
import {
  fetchPullRecords,
  formsUsingDataset,
  newPushKey,
  runPull,
  sanitizePullConfig,
  writeRecords,
  logRun,
} from "@/lib/datasets-server";

type R<T = object> = ({ ok: true } & T) | { error: string };

/** ค่าที่ใช้แทนค่า header ลับเมื่อส่งกลับไปที่ browser — ส่งค่านี้กลับมา = คงค่าเดิม */
const MASK = "••••••••";

async function guard(): Promise<{ session: KrokSession } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthorized" };
  if (!canManage(session.role)) return { error: await sm("ไม่มีสิทธิ์จัดการชุดข้อมูล") };
  return { session };
}

/** โหลด dataset ของ tenant ปัจจุบัน (ผ่าน RLS) */
async function loadOwn(id: string, session: KrokSession): Promise<(DatasetMeta & { activeBatch: string }) | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("datasets")
    .select(`${DATASET_SELECT}, active_batch`)
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!data) return null;
  return { ...rowToMeta(data as Record<string, unknown>), activeBatch: data.active_batch as string };
}

async function audit(session: KrokSession, action: string, id: string, meta: Record<string, unknown> = {}) {
  try {
    await writeAudit({
      tenant_id: session.tenantId,
      actor_id: session.userId,
      action,
      target_type: "dataset",
      target_id: id,
      meta,
    });
  } catch { /* ignore */ }
}

// ============================================================
// สร้าง / แก้ไข / ลบ
// ============================================================

export async function createDataset(input: { name: string; description?: string; sourceKind: DatasetSourceKind }): Promise<R<{ id: string }>> {
  const g = await guard();
  if ("error" in g) return g;
  const name = (input.name || "").trim().slice(0, 120);
  if (!name) return { error: await sm("กรุณาตั้งชื่อ") };
  const kind: DatasetSourceKind = ["file", "api_pull", "api_push"].includes(input.sourceKind) ? input.sourceKind : "file";

  const supabase = await createClient();
  const { count } = await supabase.from("datasets").select("id", { count: "exact", head: true }).eq("tenant_id", g.session.tenantId);
  if ((count ?? 0) >= MAX_DATASETS_PER_TENANT) return { error: `สร้างได้สูงสุด ${MAX_DATASETS_PER_TENANT} ชุดต่อองค์กร` };

  const { data, error } = await supabase
    .from("datasets")
    .insert({
      tenant_id: g.session.tenantId,
      name,
      description: (input.description || "").slice(0, 500),
      source_kind: kind,
      sync_mode: kind === "api_push" ? "upsert" : "replace",
      created_by: g.session.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message || "สร้างไม่สำเร็จ" };
  await audit(g.session, "dataset.create", data.id as string, { name, kind });
  revalidatePath("/datasets");
  return { ok: true, id: data.id as string };
}

export interface DatasetPatch {
  name?: string;
  description?: string;
  keyColumn?: string | null;
  syncMode?: DatasetSyncMode;
  scheduleMinutes?: number;
  /** คอลัมน์ทั้งชุด — key เดิมต้องคงอยู่ (เปลี่ยนได้แค่ label/type) ยกเว้นคอลัมน์ที่ไม่มีฟอร์มใช้ */
  columns?: DatasetColumn[];
}

export async function updateDataset(id: string, patch: DatasetPatch): Promise<R> {
  const g = await guard();
  if ("error" in g) return g;
  const ds = await loadOwn(id, g.session);
  if (!ds) return { error: await sm("ไม่พบชุดข้อมูล") };

  const upd: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim().slice(0, 120);
    if (!n) return { error: await sm("กรุณาตั้งชื่อ") };
    upd.name = n;
  }
  if (patch.description !== undefined) upd.description = patch.description.slice(0, 500);

  let columns = ds.columns;
  if (patch.columns !== undefined) {
    const next = sanitizeColumns(patch.columns);
    const removed = ds.columns.filter((c) => !next.some((n) => n.key === c.key)).map((c) => c.key);
    if (removed.length) {
      const supabase = await createClient();
      const used = await formsUsingDataset(supabase, g.session.tenantId, id);
      const clash = used.filter((f) => f.columns.some((c) => removed.includes(c)));
      if (clash.length) return { error: `ลบคอลัมน์ไม่ได้ — ฟอร์ม “${clash[0].title}” ยังใช้อยู่` };
    }
    columns = next;
    upd.columns = next;
  }
  if (patch.keyColumn !== undefined) {
    if (patch.keyColumn && !columns.some((c) => c.key === patch.keyColumn)) return { error: await sm("ไม่พบคอลัมน์ key ที่เลือก") };
    upd.key_column = patch.keyColumn || null;
  }
  const keyAfter = (upd.key_column !== undefined ? upd.key_column : ds.keyColumn) as string | null;
  if (keyAfter && !columns.some((c) => c.key === keyAfter)) upd.key_column = null;
  if (patch.syncMode !== undefined) {
    if (patch.syncMode === "upsert" && !((upd.key_column ?? ds.keyColumn) as string | null))
      return { error: await sm("โหมดอัปเดตตาม key ต้องเลือกคอลัมน์ key ก่อน") };
    upd.sync_mode = patch.syncMode === "upsert" ? "upsert" : "replace";
  }
  if (patch.scheduleMinutes !== undefined) {
    const m = SCHEDULE_MINUTES.includes(patch.scheduleMinutes) ? patch.scheduleMinutes : 0;
    if (m > 0 && ds.sourceKind !== "api_pull") return { error: await sm("ตั้งเวลาได้เฉพาะข้อมูลที่ดึงจาก API") };
    upd.schedule_minutes = m;
    upd.next_sync_at = m > 0 ? new Date(Date.now() + 60000).toISOString() : null;
  }
  if (Object.keys(upd).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("datasets").update(upd).eq("id", id).eq("tenant_id", g.session.tenantId);
  if (error) return { error: await sm(dbError(error)) };
  revalidatePath(`/datasets/${id}`);
  revalidatePath("/datasets");
  return { ok: true };
}

export async function deleteDataset(id: string): Promise<R> {
  const g = await guard();
  if ("error" in g) return g;
  const ds = await loadOwn(id, g.session);
  if (!ds) return { error: await sm("ไม่พบชุดข้อมูล") };
  const supabase = await createClient();
  const used = await formsUsingDataset(supabase, g.session.tenantId, id);
  if (used.length)
    return { error: `ลบไม่ได้ — ยังมี ${used.length} ฟอร์มใช้อยู่ (${used.slice(0, 3).map((f) => f.title).join(", ")}) ให้เปลี่ยนฟิลด์ในฟอร์มก่อน` };
  const { error } = await supabase.from("datasets").delete().eq("id", id).eq("tenant_id", g.session.tenantId);
  if (error) return { error: await sm(dbError(error)) };
  await audit(g.session, "dataset.delete", id, { name: ds.name, rows: ds.rowCount });
  revalidatePath("/datasets");
  return { ok: true };
}

/** ล้างข้อมูลทุกแถว (คงนิยามคอลัมน์ไว้) */
export async function clearRows(id: string): Promise<R> {
  const g = await guard();
  if ("error" in g) return g;
  const ds = await loadOwn(id, g.session);
  if (!ds) return { error: await sm("ไม่พบชุดข้อมูล") };
  try {
    const supabase = await createClient();
    await writeRecords(supabase, ds, [], "replace");
    await logRun(supabase, { id, tenantId: g.session.tenantId }, "manual", "ok", 0, "ล้างข้อมูลทั้งหมด", g.session.userId);
  } catch (e) {
    return { error: e instanceof Error ? await sm(e.message) : "ผิดพลาด" };
  }
  revalidatePath(`/datasets/${id}`);
  return { ok: true };
}

// ============================================================
// API pull
// ============================================================

export interface PullConfigView extends Omit<PullConfig, "headers"> {
  headers: { name: string; value: string; masked: boolean }[];
}

export async function getPullConfig(id: string): Promise<R<{ config: PullConfigView }>> {
  const g = await guard();
  if ("error" in g) return g;
  const ds = await loadOwn(id, g.session);
  if (!ds) return { error: await sm("ไม่พบชุดข้อมูล") };
  const admin = getAdminClient();
  if (!admin) return { error: await sm("ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY") };
  const { data } = await admin.from("dataset_secrets").select("pull_config").eq("dataset_id", id).maybeSingle();
  const cfg = sanitizePullConfig(data?.pull_config);
  return {
    ok: true,
    config: {
      ...cfg,
      // URL อาจมี token ใน query — ผู้จัดการ dataset เห็นได้ (เหมือนเจ้าของ) แต่ค่า header ไม่ส่งกลับ
      headers: cfg.headers.map((h) => ({ name: h.name, value: h.value ? MASK : "", masked: !!h.value })),
    },
  };
}

/** รวมค่า header ที่ผู้ใช้ส่งมา (ค่า MASK = คงค่าเดิม) */
async function mergedPullConfig(id: string, input: unknown): Promise<PullConfig> {
  const incoming = sanitizePullConfig(input);
  const admin = getAdminClient();
  if (!admin) throw new Error("ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY");
  const { data } = await admin.from("dataset_secrets").select("pull_config").eq("dataset_id", id).maybeSingle();
  const prev = sanitizePullConfig(data?.pull_config);
  const originOf = (u: string) => { try { return new URL(u).origin; } catch { return ""; } };
  const sameOrigin = !!prev.url && originOf(prev.url) === originOf(incoming.url);
  const masked = incoming.headers.filter((h) => h.value === MASK);
  // ค่าลับเดิมใช้ได้เฉพาะกับโดเมนเดิม — เปลี่ยนโดเมนต้องกรอกใหม่ (กันเอา token ไปยิงที่อื่น)
  if (masked.length && !sameOrigin) throw new Error(`เปลี่ยนโดเมนของ URL แล้ว — กรอกค่า header “${masked[0].name}” ใหม่`);
  incoming.headers = incoming.headers.map((h) =>
    h.value === MASK ? { name: h.name, value: prev.headers.find((p) => p.name.toLowerCase() === h.name.toLowerCase())?.value ?? "" } : h
  );
  return incoming;
}

export interface PullTestResult {
  total: number;
  paths: string[];
  /** ตัวอย่าง 20 รายการแรก เป็น {path: value} */
  sample: Record<string, string>[];
  suggested: { columns: DatasetColumn[]; field_map: PullConfig["field_map"] };
}

export async function testPull(id: string, config: unknown): Promise<R<{ result: PullTestResult }>> {
  const g = await guard();
  if ("error" in g) return g;
  const ds = await loadOwn(id, g.session);
  if (!ds) return { error: await sm("ไม่พบชุดข้อมูล") };
  try {
    const cfg = await mergedPullConfig(id, config);
    const records = await fetchPullRecords(cfg);
    const paths = inferFieldPaths(records);
    const sample = records.slice(0, 20).map((r) => {
      const o: Record<string, string> = {};
      for (const p of paths) {
        const v = getPath(r, p);
        o[p] = v == null ? "" : String(v).slice(0, 120);
      }
      return o;
    });
    return { ok: true, result: { total: records.length, paths, sample, suggested: columnsFromPaths(records, paths) } };
  } catch (e) {
    return { error: e instanceof Error ? await sm(e.message) : "เรียก API ไม่สำเร็จ" };
  }
}

/** บันทึกการตั้งค่า API + คอลัมน์ที่เลือก */
export async function savePullConfig(id: string, config: unknown, columns: DatasetColumn[], keyColumn: string | null): Promise<R> {
  const g = await guard();
  if ("error" in g) return g;
  const ds = await loadOwn(id, g.session);
  if (!ds) return { error: await sm("ไม่พบชุดข้อมูล") };
  const admin = getAdminClient();
  if (!admin) return { error: await sm("ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY") };

  let cfg: PullConfig;
  try {
    cfg = await mergedPullConfig(id, config);
    const u = new URL(cfg.url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
  } catch (e) {
    return { error: e instanceof Error && e.message ? e.message : "URL ไม่ถูกต้อง" };
  }
  const cols = sanitizeColumns(columns);
  cfg.field_map = cfg.field_map.filter((m) => cols.some((c) => c.key === m.column));
  if (!cfg.field_map.length) return { error: await sm("เลือกฟิลด์ที่จะนำเข้าอย่างน้อย 1 ช่อง") };

  // คอลัมน์ที่ฟอร์มใช้อยู่ห้ามหายไป
  const colRes = await updateDataset(id, { columns: cols, keyColumn: keyColumn && cols.some((c) => c.key === keyColumn) ? keyColumn : null });
  if ("error" in colRes) return colRes;

  const { error } = await admin
    .from("dataset_secrets")
    .upsert({ dataset_id: id, tenant_id: g.session.tenantId, pull_config: cfg, updated_at: new Date().toISOString() }, { onConflict: "dataset_id" });
  if (error) return { error: await sm(dbError(error)) };
  const supabase = await createClient();
  await supabase.from("datasets").update({ pull_host: new URL(cfg.url).host }).eq("id", id);
  await audit(g.session, "dataset.pull_config", id, { host: new URL(cfg.url).host });
  revalidatePath(`/datasets/${id}`);
  return { ok: true };
}

export async function syncNow(id: string): Promise<R<{ rows: number }>> {
  const g = await guard();
  if ("error" in g) return g;
  const ds = await loadOwn(id, g.session);
  if (!ds) return { error: await sm("ไม่พบชุดข้อมูล") };
  if (ds.lastSyncStatus === "running" && ds.updatedAt && Date.now() - new Date(ds.updatedAt).getTime() < 120000)
    return { error: await sm("กำลัง sync อยู่ ลองใหม่อีกสักครู่") };
  const admin = getAdminClient();
  if (!admin) return { error: await sm("ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY") };
  const res = await runPull(admin, id, "manual", g.session.userId);
  revalidatePath(`/datasets/${id}`);
  return res;
}

// ============================================================
// API push key
// ============================================================

/** สร้าง key ใหม่ (key เดิมใช้ไม่ได้ทันที) — คืน key เต็มครั้งเดียว */
export async function rotatePushKey(id: string): Promise<R<{ key: string }>> {
  const g = await guard();
  if ("error" in g) return g;
  const ds = await loadOwn(id, g.session);
  if (!ds) return { error: await sm("ไม่พบชุดข้อมูล") };
  const admin = getAdminClient();
  if (!admin) return { error: await sm("ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY") };
  const k = newPushKey();
  const { error } = await admin
    .from("dataset_secrets")
    .upsert({ dataset_id: id, tenant_id: g.session.tenantId, push_key_hash: k.hash, updated_at: new Date().toISOString() }, { onConflict: "dataset_id" });
  if (error) return { error: await sm(dbError(error)) };
  await admin.from("datasets").update({ push_key_prefix: k.prefix }).eq("id", id);
  await audit(g.session, "dataset.push_key_rotate", id);
  revalidatePath(`/datasets/${id}`);
  return { ok: true, key: k.key };
}

export async function revokePushKey(id: string): Promise<R> {
  const g = await guard();
  if ("error" in g) return g;
  const ds = await loadOwn(id, g.session);
  if (!ds) return { error: await sm("ไม่พบชุดข้อมูล") };
  const admin = getAdminClient();
  if (!admin) return { error: await sm("ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY") };
  await admin.from("dataset_secrets").update({ push_key_hash: null }).eq("dataset_id", id);
  await admin.from("datasets").update({ push_key_prefix: "" }).eq("id", id);
  await audit(g.session, "dataset.push_key_revoke", id);
  revalidatePath(`/datasets/${id}`);
  return { ok: true };
}

// ============================================================
// สำหรับ Form Studio: รายการ dataset + คอลัมน์ (เลือกเป็นแหล่งตัวเลือก)
// ============================================================

export interface DatasetPick { id: string; name: string; columns: DatasetColumn[]; rowCount: number }

export async function listDatasetsForPicker(): Promise<DatasetPick[]> {
  const session = await getSession();
  if (!session) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("datasets")
    .select("id, name, columns, row_count")
    .eq("tenant_id", session.tenantId)
    .order("name", { ascending: true });
  return ((data || []) as Record<string, unknown>[]).map((d) => ({
    id: d.id as string,
    name: d.name as string,
    columns: sanitizeColumns(d.columns).filter((c) => isValidColumnKey(c.key)),
    rowCount: Number(d.row_count ?? 0),
  }));
}
