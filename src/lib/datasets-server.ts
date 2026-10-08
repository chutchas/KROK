import "server-only";
import { createHash, randomBytes, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DATASET_SELECT,
  MAX_DATASET_ROWS,
  MAX_IMPORT_BYTES,
  MAX_OPTIONS,
  WRITE_CHUNK,
  chunk,
  findRecords,
  mapPulledRecords,
  rowToMeta,
  toRowPayload,
  type DatasetMeta,
  type DatasetRecord,
  type DatasetSyncMode,
  type PullConfig,
} from "@/lib/datasets";
import { areaFieldOf, datasetIdsOf, type FormField, type FormSchema, type OptionsSource } from "@/lib/form-schema";
import { FORBIDDEN_HEADERS, safeFetch } from "@/lib/safe-fetch";

type Db = SupabaseClient;

// ============================================================
// ตัวเลือก dropdown จาก dataset
// ============================================================

/**
 * ใส่ตัวเลือกจาก dataset ลงใน schema ก่อนส่งให้หน้ากรอก (คืน schema ใหม่ ไม่แก้ของเดิม)
 *
 * ต้องส่ง tenantId เสมอ: dataset ที่ไม่ใช่ขององค์กรเจ้าของฟอร์มจะถูกข้าม
 * สำคัญมากเมื่อเรียกด้วย service role (ฟอร์มสาธารณะ) ซึ่งไม่มี RLS คุ้มกัน
 */
/** ใช้ร่วมกันหลายฟอร์ม (ชุดฟอร์มออฟไลน์): ชื่อ dataset ของ workspace + ตัวเลือกที่ดึงแล้ว — ไม่ยิงซ้ำต่อฟอร์ม */
export interface OptionsShared {
  names?: Map<string, string>;
  /** รายชื่อพื้นที่ของ workspace (ดึงครั้งเดียวต่อชุด) */
  areas?: Promise<{ code: string; name: string }[] | null>;
  cache: Map<string, Promise<OptRow[] | null>>;
}

export async function resolveFormOptions(schema: FormSchema, db: Db, tenantId: string, shared?: OptionsShared): Promise<FormSchema> {
  const withAreas = areaFieldOf(schema) ? await resolveAreaOptions(schema, db, tenantId, shared) : schema;
  return resolveDatasetOptions(withAreas, db, tenantId, shared);
}

/**
 * ฟิลด์พื้นที่: ตัวเลือก = รหัสพื้นที่ที่เปิดใช้ของ workspace · ชื่อที่แสดง = ชื่อพื้นที่
 * กรอง tenant เองเสมอ (ฟอร์มสาธารณะเรียกด้วย service role) · ยังไม่รัน 0072 = ไม่มีตัวเลือก + เตือน
 */
async function resolveAreaOptions(schema: FormSchema, db: Db, tenantId: string, shared?: OptionsShared): Promise<FormSchema> {
  if (shared && !shared.areas) {
    shared.areas = Promise.resolve(
      db.from("workspace_areas").select("code, name").eq("tenant_id", tenantId).eq("active", true).order("sort").order("name")
    ).then(({ data, error }) => (error ? null : ((data || []) as { code: string; name: string }[])), () => null);
  }
  const rows = shared?.areas
    ? await shared.areas
    : await Promise.resolve(
        db.from("workspace_areas").select("code, name").eq("tenant_id", tenantId).eq("active", true).order("sort").order("name")
      ).then(({ data, error }) => (error ? null : ((data || []) as { code: string; name: string }[])), () => null);
  const out: FormSchema = structuredClone(schema);
  const f = areaFieldOf(out);
  if (!f) return out;
  if (!rows) {
    f.options = [];
    f.options_error = "ดึงรายชื่อพื้นที่ไม่ได้";
    return out;
  }
  f.options = rows.map((r) => r.code);
  f.option_labels = rows.map((r) => r.name);
  if (f.area_default && !f.options.includes(f.area_default)) delete f.area_default; // ค่าเริ่มต้นถูกปิดใช้ไปแล้ว
  return out;
}

async function resolveDatasetOptions(schema: FormSchema, db: Db, tenantId: string, shared?: OptionsShared): Promise<FormSchema> {
  const ids = datasetIdsOf(schema);
  if (ids.length === 0) return schema;

  let names = shared?.names;
  if (!names) {
    const { data: owned } = await db.from("datasets").select("id, name").eq("tenant_id", tenantId).in("id", ids);
    names = new Map(((owned || []) as { id: string; name: string }[]).map((d) => [d.id, d.name]));
  }
  const nameOf = names;

  // ดึงแต่ละชุด (dataset, column, label column, parent column) ครั้งเดียว แม้หลายฟิลด์ใช้ซ้ำ
  const cache = shared?.cache ?? new Map<string, Promise<OptRow[] | null>>();
  const load = (src: OptionsSource, withParent: boolean) => {
    const pc = withParent ? src.parent?.column ?? null : null;
    const lc = src.label_column ?? null;
    const key = `${src.dataset_id}|${src.column}|${lc ?? ""}|${pc ?? ""}`;
    if (!cache.has(key)) {
      // cascading ต้องได้ทุกคู่ (ตัวเลือก, ค่าแม่) — ขอมากกว่าปกติ ไม่งั้นแม่บางค่าจะไม่มีลูก
      const limit = pc ? MAX_CASCADE_PAIRS : MAX_OPTIONS + 1;
      // มีคอลัมน์ที่แสดง → ใช้ RPC ใหม่ (0031) · ไม่มี → ตัวเดิม (ใช้ได้แม้ยังไม่รัน 0031)
      const call = lc
        ? db.rpc("dataset_option_rows", { p_dataset: src.dataset_id, p_column: src.column, p_label_column: lc, p_parent_column: pc, p_limit: limit })
        : db.rpc("dataset_options", { p_dataset: src.dataset_id, p_column: src.column, p_parent_column: pc, p_limit: limit });
      cache.set(
        key,
        nameOf.has(src.dataset_id)
          ? Promise.resolve(call).then(({ data, error }) => (error ? null : ((data || []) as OptRow[])))
          : Promise.resolve(null)
      );
    }
    return cache.get(key)!;
  };

  const out: FormSchema = structuredClone(schema);
  const jobs: Promise<void>[] = [];

  for (const s of out.steps)
    for (const f of s.fields) {
      if (f.options_source && (f.type === "select" || f.type === "checkbox")) {
        const src = f.options_source;
        jobs.push(
          load(src, !!src.parent).then((rows) => applyToField(f, rows, nameOf.get(src.dataset_id), !!src.parent, !!src.label_column))
        );
      }
      for (const c of f.columns || []) {
        if (c.type !== "select" || !c.options_source) continue;
        const src = c.options_source;
        jobs.push(
          load(src, false).then((rows) => {
            if (!rows) return;
            const list = uniqRows(rows).slice(0, MAX_OPTIONS);
            c.options = list.map((r) => r.v);
            if (src.label_column) c.option_labels = list.map((r) => r.l || "");
          })
        );
      }
    }
  await Promise.all(jobs);

  // ฟิลด์แม่ดึงตัวเลือกไม่ได้ → ฟิลด์ลูกไม่กรอง (ไม่งั้นจะค้าง "เลือก … ก่อน" จนส่งฟอร์มไม่ได้)
  const byId = new Map(out.steps.flatMap((s) => s.fields).map((f) => [f.id, f]));
  for (const s of out.steps)
    for (const f of s.fields) {
      const pid = f.options_source?.parent?.field_id;
      if (pid && byId.get(pid)?.options_error && f.options_parents && f.options) {
        const list = uniqRows(f.options.map((v, i) => ({ v, l: f.option_labels?.[i] ?? null, p: null })));
        f.options = list.map((r) => r.v);
        if (f.option_labels) f.option_labels = list.map((r) => r.l || "");
        delete f.options_parents;
      }
    }
  return out;
}

type OptRow = { v: string; l?: string | null; p: string | null };

/** จำนวนคู่ (ตัวเลือก, ค่าแม่) สูงสุดของ dropdown ที่กรองตามกัน (= เพดานของ RPC) */
const MAX_CASCADE_PAIRS = 5000;

/** ตัดค่าซ้ำ (เก็บตัวแรก) โดยให้ชื่อที่แสดงยังตรงกับค่า */
function uniqRows(rows: OptRow[]): OptRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.v) ? false : (seen.add(r.v), true)));
}

function applyToField(f: FormField, rows: OptRow[] | null, dsName: string | undefined, cascading: boolean, labeled: boolean) {
  if (!rows) {
    // dataset ถูกลบ/ไม่มีสิทธิ์/ยังไม่รัน migration → ใช้ตัวเลือกที่พิมพ์ไว้ (ถ้ามี) และเตือน
    f.options_error = dsName ? "ดึงตัวเลือกจากถังข้อมูลไม่ได้" : "ไม่พบถังข้อมูลที่ฟิลด์นี้ใช้";
    delete f.options_source?.parent;
    return;
  }
  const list = cascading ? rows : uniqRows(rows);
  const kept = list.slice(0, cascading ? MAX_CASCADE_PAIRS : MAX_OPTIONS);
  f.options = kept.map((r) => r.v);
  if (labeled) f.option_labels = kept.map((r) => r.l || "");
  if (cascading) f.options_parents = kept.map((r) => r.p ?? "");
  if (list.length > kept.length || (cascading && rows.length >= MAX_CASCADE_PAIRS)) f.options_truncated = true;
}

// ============================================================
// เขียนข้อมูล (ใช้ร่วม: ไฟล์ / API pull / API push)
// ============================================================

export interface WriteResult { ok: true; rows: number; skipped: number }

/**
 * เขียน records ลง dataset
 *   replace: เขียนลง batch ใหม่ทีละก้อน แล้ว commit แบบ compare-and-swap (สลับทั้งชุด)
 *            ล้มกลางทาง → ชุดเดิมไม่เสีย · มีการนำเข้าอื่น commit ก่อน → error ให้ลองใหม่
 *   upsert : เขียนทับตาม key ลง active batch ณ ตอนเขียน — แถวที่ไม่มีค่า key ถูกข้าม (กันแถวซ้ำสะสม)
 */
export async function writeRecords(
  db: Db,
  ds: Pick<DatasetMeta, "id" | "keyColumn">,
  records: DatasetRecord[],
  mode: DatasetSyncMode
): Promise<WriteResult> {
  if (records.length > MAX_DATASET_ROWS) throw new Error(`ข้อมูลเกิน ${MAX_DATASET_ROWS.toLocaleString()} แถว`);
  if (mode === "upsert" && !ds.keyColumn) throw new Error("โหมด upsert ต้องกำหนดคอลัมน์ key ก่อน");

  let payload = toRowPayload(records, ds.keyColumn);
  let skipped = 0;
  if (mode === "upsert") {
    const withKey = payload.filter((r) => r.k !== null);
    skipped = payload.length - withKey.length;
    payload = withKey;
  }

  if (mode === "upsert") {
    for (const part of chunk(payload, WRITE_CHUNK)) {
      const { error } = await db.rpc("dataset_write_rows", { p_dataset: ds.id, p_batch: null, p_rows: part });
      if (error) throw new Error(friendly(error.message));
    }
    const { data: n, error } = await db.rpc("dataset_refresh", { p_dataset: ds.id });
    if (error) throw new Error(friendly(error.message));
    return { ok: true, rows: typeof n === "number" ? n : payload.length, skipped };
  }

  // ---- replace ----
  const { data: cur } = await db.from("datasets").select("active_batch").eq("id", ds.id).maybeSingle();
  const expected = (cur?.active_batch as string) || null;
  if (!expected) throw new Error("ไม่พบ dataset");
  const batch = randomUUID();
  try {
    for (const part of chunk(payload, WRITE_CHUNK)) {
      const { error } = await db.rpc("dataset_write_rows", { p_dataset: ds.id, p_batch: batch, p_rows: part });
      if (error) throw new Error(friendly(error.message));
    }
    const { data: n, error } = await db.rpc("dataset_commit", { p_dataset: ds.id, p_batch: batch, p_expected: expected });
    if (error) throw new Error(friendly(error.message));
    return { ok: true, rows: typeof n === "number" ? n : payload.length, skipped };
  } catch (e) {
    await db.rpc("dataset_discard", { p_dataset: ds.id, p_batch: batch });
    throw e;
  }
}

function friendly(msg: string): string {
  if (msg.includes("changed during import")) return "มีการนำเข้าอื่นเสร็จก่อนระหว่างนี้ — ลองใหม่อีกครั้ง";
  if (msg.includes("row limit exceeded")) {
    const m = msg.match(/max (\d+)/);
    return `จำนวนแถวเกินที่แพ็กเกจรองรับ${m ? ` (สูงสุด ${Number(m[1]).toLocaleString()} แถวต่อถัง)` : ""} — อัปเกรดแพ็กเกจเพื่อเพิ่มโควตา`;
  }
  if (msg.includes("[quota:")) return msg.replace(/\s*\[quota:[a-z_]+\]\s*$/, "");
  if (msg.includes("forbidden")) return "ไม่มีสิทธิ์แก้ไขถังข้อมูลนี้";
  return msg;
}

export async function logRun(
  db: Db,
  ds: { id: string; tenantId: string },
  kind: "manual" | "file" | "schedule" | "push",
  status: "ok" | "error",
  rowsIn: number,
  message: string,
  actorId?: string | null
) {
  try {
    await db.from("dataset_sync_runs").insert({
      dataset_id: ds.id,
      tenant_id: ds.tenantId,
      kind,
      status,
      rows_in: rowsIn,
      message: message.slice(0, 500),
      actor_id: actorId ?? null,
    });
    if (status === "error")
      await db.from("datasets").update({ last_sync_status: "error", last_sync_error: message.slice(0, 500) }).eq("id", ds.id);
  } catch { /* log ล้มเหลวไม่ควรทำให้การนำเข้าล้ม */ }
}

// ============================================================
// API pull
// ============================================================

export function sanitizePullConfig(raw: unknown): PullConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const headers = (Array.isArray(o.headers) ? o.headers : [])
    .map((h) => {
      const ho = (h ?? {}) as Record<string, unknown>;
      return { name: String(ho.name ?? "").trim().slice(0, 100), value: String(ho.value ?? "").slice(0, 2000) };
    })
    .filter((h) => /^[A-Za-z0-9-]+$/.test(h.name) && !FORBIDDEN_HEADERS.has(h.name.toLowerCase()))
    .slice(0, 10);
  const field_map = (Array.isArray(o.field_map) ? o.field_map : [])
    .map((m) => {
      const mo = (m ?? {}) as Record<string, unknown>;
      return { column: String(mo.column ?? ""), path: String(mo.path ?? "").trim().slice(0, 200) };
    })
    .filter((m) => m.column && m.path)
    .slice(0, 40);
  return {
    url: String(o.url ?? "").trim().slice(0, 2000),
    method: o.method === "POST" ? "POST" : "GET",
    records_path: String(o.records_path ?? "").trim().slice(0, 200),
    headers,
    body: o.method === "POST" && o.body ? String(o.body).slice(0, 20000) : undefined,
    field_map,
  };
}

/** เรียก API แล้วคืน array ของรายการ */
export async function fetchPullRecords(cfg: PullConfig): Promise<unknown[]> {
  if (!cfg.url) throw new Error("ยังไม่ได้ใส่ URL");
  const headers: Record<string, string> = {};
  for (const h of cfg.headers) headers[h.name] = h.value;
  if (cfg.method === "POST" && cfg.body && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type"))
    headers["content-type"] = "application/json";

  const res = await safeFetch(cfg.url, { method: cfg.method, headers, body: cfg.method === "POST" ? cfg.body : undefined, maxBytes: MAX_IMPORT_BYTES });
  if (res.status < 200 || res.status >= 300) throw new Error(`API ตอบกลับ HTTP ${res.status}`);
  let json: unknown;
  try {
    json = JSON.parse(res.body.toString("utf8"));
  } catch {
    throw new Error("API ไม่ได้ตอบกลับเป็น JSON");
  }
  const records = findRecords(json, cfg.records_path);
  if (!records) throw new Error(cfg.records_path ? `ไม่พบ array ที่ path "${cfg.records_path}"` : "หา array ของรายการใน response ไม่เจอ — ระบุ path เอง");
  return records;
}

/** sync หนึ่ง dataset จาก API (ใช้ทั้งปุ่ม sync และตั้งเวลา) — ต้องใช้ service role */
export async function runPull(admin: Db, datasetId: string, kind: "manual" | "schedule", actorId?: string | null): Promise<{ ok: true; rows: number } | { error: string }> {
  const { data: row } = await admin.from("datasets").select(`${DATASET_SELECT}, tenant_id`).eq("id", datasetId).maybeSingle();
  if (!row) return { error: "ไม่พบ dataset" };
  const ds = rowToMeta(row as Record<string, unknown>);
  const tenantId = row.tenant_id as string;

  const { data: sec } = await admin.from("dataset_secrets").select("pull_config").eq("dataset_id", datasetId).maybeSingle();
  const cfg = sanitizePullConfig(sec?.pull_config);

  const next = ds.scheduleMinutes > 0 ? new Date(Date.now() + ds.scheduleMinutes * 60000).toISOString() : null;
  await admin.from("datasets").update({ last_sync_status: "running", next_sync_at: next }).eq("id", datasetId);

  try {
    if (!cfg.field_map.length) throw new Error("ยังไม่ได้เลือกฟิลด์ที่จะนำเข้า");
    const raw = await fetchPullRecords(cfg);
    const records = mapPulledRecords(raw, ds.columns, cfg.field_map);
    const res = await writeRecords(admin, ds, records, ds.syncMode);
    await logRun(admin, { id: ds.id, tenantId }, kind, "ok", records.length, `นำเข้า ${records.length} รายการ${res.skipped ? ` (ข้าม ${res.skipped} ที่ไม่มี key)` : ""} · รวม ${res.rows} แถว`, actorId);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ผิดพลาด";
    await logRun(admin, { id: ds.id, tenantId }, kind, "error", 0, msg, actorId);
    return { error: msg };
  }
}

// ============================================================
// API push key
// ============================================================

export function hashPushKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function newPushKey(): { key: string; prefix: string; hash: string } {
  const key = "kds_" + randomBytes(24).toString("base64url");
  return { key, prefix: key.slice(0, 8), hash: hashPushKey(key) };
}

/** ฟอร์มที่อ้างอิง dataset นี้ (ใช้กันลบ/เตือนตอนลบคอลัมน์) */
export async function formsUsingDataset(db: Db, tenantId: string, datasetId: string): Promise<{ id: string; title: string; icon: string; columns: string[] }[]> {
  const { data } = await db
    .from("forms")
    .select("id, title, icon, schema")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);
  const using = ((data || []) as { id: string; title: string; icon: string; schema: unknown }[]).filter((f) =>
    JSON.stringify(f.schema ?? "").includes(datasetId)
  );
  return using.map((f) => {
    const cols = new Set<string>();
    const s = f.schema as FormSchema;
    for (const st of s?.steps || [])
      for (const fl of st.fields || []) {
        const src = fl.options_source;
        if (src?.dataset_id === datasetId) {
          cols.add(src.column);
          if (src.label_column) cols.add(src.label_column);
          if (src.parent) cols.add(src.parent.column);
        }
        for (const c of fl.columns || []) {
          const cs = c.options_source;
          if (cs?.dataset_id === datasetId) { cols.add(cs.column); if (cs.label_column) cols.add(cs.label_column); }
        }
      }
    return { id: f.id, title: f.title, icon: f.icon, columns: [...cols] };
  });
}
