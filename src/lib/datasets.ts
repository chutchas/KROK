// ============================================================
// KROK · Dataset (ข้อมูลอ้างอิง) — type + ฟังก์ชันบริสุทธิ์ (ใช้ได้ทั้ง client/server, เทสต์ได้)
//
// dataset = ตารางข้อมูลขององค์กร (ลูกค้า, สาขา, รหัสสินค้า, รายชื่อรถ ฯลฯ)
// นำเข้าจาก CSV/Excel, ดึงจาก API ภายนอก หรือให้ระบบอื่นยิงเข้ามา
// แล้วใช้เป็นตัวเลือกของ dropdown ในฟอร์ม (FormField.options_source)
// ============================================================

export type DatasetColType = "text" | "number";

export interface DatasetColumn {
  /** ชื่อภายใน — ใช้อ้างอิงจากฟอร์ม/API ห้ามเปลี่ยนหลังสร้าง */
  key: string;
  /** ชื่อที่แสดง (เปลี่ยนได้) */
  label: string;
  type: DatasetColType;
}

export type DatasetSourceKind = "file" | "api_pull" | "api_push";
export type DatasetSyncMode = "replace" | "upsert";
export type DatasetCell = string | number | null;
export type DatasetRecord = Record<string, DatasetCell>;

export interface DatasetMeta {
  id: string;
  name: string;
  description: string;
  columns: DatasetColumn[];
  keyColumn: string | null;
  sourceKind: DatasetSourceKind;
  syncMode: DatasetSyncMode;
  rowCount: number;
  scheduleMinutes: number;
  nextSyncAt: string | null;
  pullHost: string;
  pushKeyPrefix: string;
  lastSyncedAt: string | null;
  lastSyncStatus: "" | "ok" | "error" | "running";
  lastSyncError: string;
  updatedAt: string | null;
}

/** การตั้งค่า API pull (เก็บใน dataset_secrets — ไม่ส่งค่า header ลับกลับไปที่ browser) */
export interface PullConfig {
  url: string;
  method: "GET" | "POST";
  /** path ไปยัง array ของรายการใน JSON เช่น "data.items" (ว่าง = หาให้อัตโนมัติ) */
  records_path: string;
  headers: { name: string; value: string }[];
  /** body (เฉพาะ POST) เป็นข้อความ JSON */
  body?: string;
  /** คอลัมน์ ← path ในแต่ละรายการ เช่น { column: "cust_name", path: "customer.name" } */
  field_map: { column: string; path: string }[];
}

// ---- ขีดจำกัด ----
export const MAX_DATASETS_PER_TENANT = 50;
/** เพดานสูงสุดของระบบ (แถวต่อถัง) — ลิมิตจริงต่อ workspace ตามแพ็กเกจ (maxDatasetRows) ซึ่งต่ำกว่านี้ */
export const MAX_DATASET_ROWS = 200000;
export const MAX_DATASET_COLUMNS = 40;
export const MAX_CELL_CHARS = 500;
/** แถวต่อการเรียก RPC หนึ่งครั้ง (RPC รับได้สูงสุด 5000) */
export const WRITE_CHUNK = 2000;
/** ตัวเลือกสูงสุดต่อ dropdown หนึ่งช่อง */
export const MAX_OPTIONS = 2000;
/** ไฟล์นำเข้า / body ของ API push / response ของ API pull */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export const SCHEDULE_CHOICES: { minutes: number; label: string }[] = [
  { minutes: 0, label: "ไม่ตั้งเวลา (กด sync เอง)" },
  { minutes: 15, label: "ทุก 15 นาที" },
  { minutes: 60, label: "ทุกชั่วโมง" },
  { minutes: 360, label: "ทุก 6 ชั่วโมง" },
  { minutes: 1440, label: "วันละครั้ง" },
];
export const SCHEDULE_MINUTES = SCHEDULE_CHOICES.map((c) => c.minutes);

export const SOURCE_LABEL: Record<DatasetSourceKind, string> = {
  file: "ไฟล์ CSV/Excel",
  api_pull: "ดึงจาก API",
  api_push: "รับจาก API (push)",
};

const KEY_RE = /^[a-z_][a-z0-9_]{0,39}$/;

// ============================================================
// คอลัมน์
// ============================================================

/** สร้าง key ภายในจากชื่อหัวคอลัมน์ (ภาษาไทยจะกลายเป็น c1, c2 ...) ไม่ซ้ำกับ used */
export function slugKey(label: string, index: number, used: Set<string>): string {
  let k = String(label ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  if (!k || !/^[a-z_]/.test(k)) k = k && /^[0-9]/.test(k) ? `c_${k}`.slice(0, 32) : `c${index + 1}`;
  let out = k;
  let n = 2;
  while (used.has(out)) out = `${k}_${n++}`;
  used.add(out);
  return out;
}

export function sanitizeColumns(raw: unknown): DatasetColumn[] {
  if (!Array.isArray(raw)) return [];
  const used = new Set<string>();
  const out: DatasetColumn[] = [];
  for (const c of raw) {
    if (out.length >= MAX_DATASET_COLUMNS) break;
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const key = String(o.key ?? "");
    if (!KEY_RE.test(key) || used.has(key)) continue;
    used.add(key);
    out.push({
      key,
      label: String(o.label ?? key).slice(0, 80) || key,
      type: o.type === "number" ? "number" : "text",
    });
  }
  return out;
}

export function isValidColumnKey(k: string): boolean {
  return KEY_RE.test(k);
}

// ============================================================
// ค่าในเซลล์
// ============================================================

export function coerceCell(v: unknown, type: DatasetColType): DatasetCell {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    // exceljs: rich text / formula result / hyperlink
    const o = v as Record<string, unknown>;
    if ("result" in o) return coerceCell(o.result, type);
    if ("text" in o) return coerceCell(o.text, type);
    if (Array.isArray(o.richText)) return coerceCell(o.richText.map((r) => (r as { text?: string }).text ?? "").join(""), type);
    return null;
  }
  if (type === "number") {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const s = String(v).replace(/[,\s]/g, "");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const s = String(v).trim().slice(0, MAX_CELL_CHARS);
  return s === "" ? null : s;
}

/** ค่าในเซลล์ → ข้อความสำหรับแสดง/เป็นตัวเลือก */
export function cellText(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

// ============================================================
// CSV
// ============================================================

/** เดาตัวคั่นจากบรรทัดแรก: , ; หรือ tab */
export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => ({ d, n: first.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

/** parser CSV ตาม RFC 4180 (รองรับ "..." ที่มี , ขึ้นบรรทัดใหม่ และ "" ข้างใน) */
export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else q = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") q = true;
    else if (ch === d) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** ถอดรหัสไฟล์ข้อความ: UTF-8 ก่อน ถ้าไม่ใช่ UTF-8 ให้ลอง windows-874 (CSV ภาษาไทยจาก Excel รุ่นเก่า) */
export function decodeText(buf: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder("windows-874").decode(buf);
    } catch {
      return new TextDecoder("utf-8").decode(buf);
    }
  }
}

// ============================================================
// ตาราง (แถวแรกเป็นหัวคอลัมน์) → คอลัมน์ + records
// ============================================================

export interface ParsedTable {
  columns: DatasetColumn[];
  /** header เดิมตามลำดับคอลัมน์ */
  headers: string[];
  records: DatasetRecord[];
  totalRows: number;
}

/** เดาชนิดคอลัมน์: ทุกค่าที่ไม่ว่างเป็นตัวเลข → number (ยกเว้นขึ้นต้นด้วย 0 เช่น รหัส 0012 ให้เป็น text) */
export function inferType(values: unknown[]): DatasetColType {
  let seen = 0;
  for (const v of values) {
    if (v == null || v === "") continue;
    seen++;
    if (typeof v === "number") continue;
    const s = String(v).trim();
    if (/^0\d/.test(s)) return "text";
    if (!/^-?[\d,]*\.?\d+$/.test(s.replace(/\s/g, ""))) return "text";
  }
  return seen > 0 ? "number" : "text";
}

export function tableFromMatrix(matrix: unknown[][]): ParsedTable {
  const [head = [], ...body] = matrix;
  const width = Math.min(MAX_DATASET_COLUMNS, Math.max(head.length, ...body.slice(0, 50).map((r) => r.length), 0));
  const used = new Set<string>();
  const headers: string[] = [];
  const columns: DatasetColumn[] = [];
  for (let i = 0; i < width; i++) {
    const label = cellText(coerceCell(head[i], "text")) || `คอลัมน์ ${i + 1}`;
    headers.push(label);
    columns.push({
      key: slugKey(label, i, used),
      label: label.slice(0, 80),
      type: inferType(body.slice(0, 500).map((r) => coerceCell(r[i], "text"))),
    });
  }
  const records: DatasetRecord[] = [];
  for (const r of body) {
    const rec: DatasetRecord = {};
    let any = false;
    columns.forEach((c, i) => {
      const v = coerceCell(r[i], c.type);
      rec[c.key] = v;
      if (v !== null) any = true;
    });
    if (any) records.push(rec);
  }
  return { columns, headers, records, totalRows: records.length };
}

// ============================================================
// JSON (API pull / push)
// ============================================================

/** อ่านค่าจาก path แบบจุด เช่น "data.items.0.name" (ว่าง = ตัวมันเอง) */
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const COMMON_ARRAY_KEYS = ["data", "items", "results", "records", "rows", "list", "value", "content"];

/** หา array ของรายการใน response */
export function findRecords(json: unknown, path: string): unknown[] | null {
  if (path) {
    const v = getPath(json, path);
    return Array.isArray(v) ? v : null;
  }
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    for (const k of COMMON_ARRAY_KEYS) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
      const inner = o[k];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        for (const k2 of COMMON_ARRAY_KEYS) if (Array.isArray((inner as Record<string, unknown>)[k2])) return (inner as Record<string, unknown>)[k2] as unknown[];
      }
    }
    for (const v of Object.values(o)) if (Array.isArray(v)) return v;
  }
  return null;
}

const isScalar = (v: unknown) => v == null || ["string", "number", "boolean"].includes(typeof v);

/** เดา field จากรายการ: ค่า scalar ชั้นบน + object ซ้อนหนึ่งชั้น (เช่น customer.name) */
export function inferFieldPaths(records: unknown[]): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (p: string) => { if (!seen.has(p) && paths.length < MAX_DATASET_COLUMNS) { seen.add(p); paths.push(p); } };
  for (const r of records.slice(0, 50)) {
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
      if (isScalar(v)) add(k);
      else if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) if (isScalar(v2)) add(`${k}.${k2}`);
      }
    }
  }
  return paths;
}

/** สร้างคอลัมน์ + field_map จาก path ที่เดาได้ */
export function columnsFromPaths(records: unknown[], paths: string[]): { columns: DatasetColumn[]; field_map: PullConfig["field_map"] } {
  const used = new Set<string>();
  const columns: DatasetColumn[] = [];
  const field_map: PullConfig["field_map"] = [];
  paths.slice(0, MAX_DATASET_COLUMNS).forEach((p, i) => {
    const key = slugKey(p, i, used);
    columns.push({ key, label: p, type: inferType(records.slice(0, 500).map((r) => getPath(r, p))) });
    field_map.push({ column: key, path: p });
  });
  return { columns, field_map };
}

/** รายการจาก API pull → record ตาม field_map */
export function mapPulledRecords(records: unknown[], columns: DatasetColumn[], fieldMap: PullConfig["field_map"]): DatasetRecord[] {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const out: DatasetRecord[] = [];
  for (const r of records) {
    if (!r || typeof r !== "object") continue;
    const rec: DatasetRecord = {};
    let any = false;
    for (const m of fieldMap) {
      const col = byKey.get(m.column);
      if (!col) continue;
      const v = coerceCell(getPath(r, m.path), col.type);
      rec[col.key] = v;
      if (v !== null) any = true;
    }
    if (any) out.push(rec);
  }
  return out;
}

/** รายการจาก API push → record: จับคู่ด้วย key ก่อน ไม่เจอค่อยหาตาม label */
export function mapPushedRecord(r: unknown, columns: DatasetColumn[]): DatasetRecord | null {
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const o = r as Record<string, unknown>;
  const rec: DatasetRecord = {};
  let any = false;
  for (const c of columns) {
    const raw = c.key in o ? o[c.key] : o[c.label];
    const v = coerceCell(raw, c.type);
    rec[c.key] = v;
    if (v !== null) any = true;
  }
  return any ? rec : null;
}

// ============================================================
// payload สำหรับ RPC dataset_write_rows
// ============================================================

export interface RowPayload { k: string | null; d: DatasetRecord }

export function toRowPayload(records: DatasetRecord[], keyColumn: string | null): RowPayload[] {
  return records.map((d) => {
    const kv = keyColumn ? d[keyColumn] : null;
    const k = kv == null || kv === "" ? null : String(kv).slice(0, MAX_CELL_CHARS);
    return { k, d };
  });
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ============================================================
// dropdown ที่กรองตามกัน (cascading)
// ============================================================

/**
 * ตัวเลือกที่ใช้ได้ตามค่าของฟิลด์แม่
 *   parents = ค่าคอลัมน์กรองของแต่ละตัวเลือก (ขนานกับ options)
 *   ไม่มี parents → คืนทั้งหมด (ไม่ใช่ cascading)
 *   มี parents แต่ฟิลด์แม่ยังว่าง → คืน [] (ต้องเลือกฟิลด์แม่ก่อน)
 */
export function filterOptions(options: string[], parents: string[] | undefined, parentValue: unknown): string[] {
  if (!parents) return options;
  const pv = Array.isArray(parentValue) ? parentValue.map(String) : parentValue == null || parentValue === "" ? [] : [String(parentValue)];
  if (pv.length === 0) return [];
  const set = new Set(pv);
  const out: string[] = [];
  const seen = new Set<string>();
  options.forEach((o, i) => {
    if (set.has(parents[i] ?? "") && !seen.has(o)) { seen.add(o); out.push(o); }
  });
  return out;
}

/** แปลงแถวจาก DB เป็น DatasetMeta */
export function rowToMeta(r: Record<string, unknown>): DatasetMeta {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    columns: sanitizeColumns(r.columns),
    keyColumn: (r.key_column as string) || null,
    sourceKind: (["file", "api_pull", "api_push"].includes(r.source_kind as string) ? r.source_kind : "file") as DatasetSourceKind,
    syncMode: r.sync_mode === "upsert" ? "upsert" : "replace",
    rowCount: Number(r.row_count ?? 0),
    scheduleMinutes: Number(r.schedule_minutes ?? 0),
    nextSyncAt: (r.next_sync_at as string) || null,
    pullHost: String(r.pull_host ?? ""),
    pushKeyPrefix: String(r.push_key_prefix ?? ""),
    lastSyncedAt: (r.last_synced_at as string) || null,
    lastSyncStatus: (r.last_sync_status as DatasetMeta["lastSyncStatus"]) || "",
    lastSyncError: String(r.last_sync_error ?? ""),
    updatedAt: (r.updated_at as string) || null,
  };
}

export const DATASET_SELECT =
  "id, name, description, columns, key_column, source_kind, sync_mode, row_count, schedule_minutes, next_sync_at, pull_host, push_key_prefix, last_synced_at, last_sync_status, last_sync_error, updated_at";
