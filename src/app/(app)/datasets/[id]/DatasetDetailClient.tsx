"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Field, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { ArrowLeft, Trash2, Save, Plus, X, KeyRound, Search, Eraser, History, FileText } from "lucide-react";
import {
  SOURCE_LABEL,
  cellText,
  isValidColumnKey,
  slugKey,
  type DatasetColumn,
  type DatasetMeta,
  type DatasetRecord,
  type DatasetSyncMode,
} from "@/lib/datasets";
import { clearRows, deleteDataset, updateDataset } from "../actions";
import { SOURCE_ICON, SyncBadge, fmtTime, label, selectStyle, smallBtn, tableWrap, td, th } from "../ui";
import FileImportPanel from "./FileImportPanel";
import PullPanel from "./PullPanel";
import PushPanel from "./PushPanel";

export interface SyncRun {
  id: number;
  kind: "manual" | "file" | "schedule" | "push";
  status: "ok" | "error";
  rows_in: number;
  message: string;
  created_at: string;
}

const KIND_LABEL: Record<SyncRun["kind"], string> = { manual: "กดเอง", file: "ไฟล์", schedule: "ตั้งเวลา", push: "API push" };

export default function DatasetDetailClient({
  ds,
  rows,
  previewLimit,
  runs,
  usedBy,
  canEdit,
}: {
  ds: DatasetMeta;
  rows: DatasetRecord[];
  previewLimit: number;
  runs: SyncRun[];
  usedBy: { id: string; title: string; icon: string; columns: string[] }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(ds.name);
  const [desc, setDesc] = useState(ds.description);
  const [cols, setCols] = useState<DatasetColumn[]>(ds.columns);
  const [keyCol, setKeyCol] = useState<string | null>(ds.keyColumn);
  const [mode, setMode] = useState<DatasetSyncMode>(ds.syncMode);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [q, setQ] = useState("");

  const usedCols = useMemo(() => new Set(usedBy.flatMap((f) => f.columns)), [usedBy]);
  const dirty =
    name !== ds.name ||
    desc !== ds.description ||
    keyCol !== ds.keyColumn ||
    mode !== ds.syncMode ||
    JSON.stringify(cols) !== JSON.stringify(ds.columns);

  async function run(tag: string, fn: () => Promise<{ ok: true } | { error: string }>, okMsg?: string) {
    setBusy(tag);
    setMsg(null);
    try {
      const res = await fn();
      if ("error" in res) setMsg({ t: res.error, err: true });
      else {
        if (okMsg) setMsg({ t: okMsg });
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  function addColumn() {
    const used = new Set(cols.map((c) => c.key));
    const key = slugKey(`col ${cols.length + 1}`, cols.length, used);
    setCols([...cols, { key, label: `คอลัมน์ ${cols.length + 1}`, type: "text" }]);
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => Object.values(r).some((v) => cellText(v).toLowerCase().includes(s)));
  }, [rows, q]);

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div>
        <Link href="/datasets" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".85rem", color: "var(--ink-2)", textDecoration: "none" }}>
          <Icon icon={ArrowLeft} className="h-4 w-4" /> ข้อมูลอ้างอิงทั้งหมด
        </Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <h1 style={{ fontSize: "1.35rem", margin: 0 }}>{ds.name}</h1>
          <SyncBadge ds={ds} />
        </div>
        <div style={{ fontSize: ".82rem", color: "var(--ink-3)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
          <Icon icon={SOURCE_ICON[ds.sourceKind]} className="h-3.5 w-3.5" /> {SOURCE_LABEL[ds.sourceKind]} · {ds.rowCount.toLocaleString()} แถว
          {ds.lastSyncStatus === "error" && ds.lastSyncError && <span style={{ color: "var(--fail)" }}>· {ds.lastSyncError}</span>}
        </div>
      </div>

      {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

      {/* ---------- แหล่งข้อมูล ---------- */}
      {canEdit && ds.sourceKind === "file" && <FileImportPanel ds={ds} onDone={() => router.refresh()} />}
      {canEdit && ds.sourceKind === "api_pull" && <PullPanel ds={ds} usedCols={usedCols} onDone={() => router.refresh()} />}
      {canEdit && ds.sourceKind === "api_push" && <PushPanel ds={ds} />}

      {/* ---------- คอลัมน์และการตั้งค่า ---------- */}
      <Card>
        <b style={{ fontFamily: "var(--font-anuphan)" }}>ตั้งค่าและคอลัมน์</b>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <div>
            <label style={label}>ชื่อ</label>
            <Field value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} maxLength={120} />
          </div>
          <div>
            <label style={label}>คำอธิบาย</label>
            <Field value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!canEdit} maxLength={500} />
          </div>
        </div>

        <label style={label}>คอลัมน์</label>
        {cols.length === 0 ? (
          <p style={{ fontSize: ".85rem", color: "var(--ink-3)", margin: 0 }}>
            ยังไม่มีคอลัมน์ — {ds.sourceKind === "file" ? "อัปโหลดไฟล์แล้วระบบจะสร้างให้" : ds.sourceKind === "api_pull" ? "ทดสอบ API แล้วเลือกฟิลด์" : "เพิ่มเอง หรือให้ระบบสร้างจากข้อมูลที่ push เข้ามาครั้งแรก"}
          </p>
        ) : (
          <div style={tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>ชื่อที่แสดง</th>
                  <th style={th}>ชนิด</th>
                  <th style={th}>ชื่อภายใน (API)</th>
                  <th style={th} title="ค่าไม่ซ้ำในแต่ละแถว ใช้อัปเดตรายแถว"><Icon icon={KeyRound} className="h-3.5 w-3.5" /> key</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {cols.map((c, i) => {
                  const isNew = !ds.columns.some((o) => o.key === c.key);
                  return (
                    <tr key={c.key}>
                      <td style={{ ...td, minWidth: 160 }}>
                        <Field value={c.label} disabled={!canEdit} onChange={(e) => setCols(cols.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))} style={{ padding: "6px 8px", fontSize: ".85rem" }} />
                      </td>
                      <td style={td}>
                        <select value={c.type} disabled={!canEdit} onChange={(e) => setCols(cols.map((x, xi) => (xi === i ? { ...x, type: e.target.value === "number" ? "number" : "text" } : x)))} style={{ ...selectStyle, padding: "5px 8px" }}>
                          <option value="text">ข้อความ</option>
                          <option value="number">ตัวเลข</option>
                        </select>
                      </td>
                      <td style={td}>
                        {isNew && canEdit ? (
                          <Field value={c.key} onChange={(e) => setCols(cols.map((x, xi) => (xi === i ? { ...x, key: e.target.value.toLowerCase() } : x)))} style={{ padding: "6px 8px", fontSize: ".82rem", fontFamily: "monospace", borderColor: isValidColumnKey(c.key) ? undefined : "var(--fail)" }} />
                        ) : (
                          <code style={{ fontSize: ".8rem" }}>{c.key}</code>
                        )}
                        {usedCols.has(c.key) && <span style={{ fontSize: ".7rem", color: "var(--accent)", marginLeft: 6 }}>ฟอร์มใช้อยู่</span>}
                      </td>
                      <td style={td}>
                        <input type="radio" name="keycol" checked={keyCol === c.key} disabled={!canEdit} onChange={() => setKeyCol(c.key)} style={{ accentColor: "var(--accent)" }} />
                      </td>
                      <td style={td}>
                        {canEdit && (
                          <button
                            onClick={() => { setCols(cols.filter((_, xi) => xi !== i)); if (keyCol === c.key) setKeyCol(null); }}
                            disabled={usedCols.has(c.key)}
                            title={usedCols.has(c.key) ? "ฟอร์มใช้คอลัมน์นี้อยู่" : "ลบคอลัมน์"}
                            style={{ ...smallBtn, color: "var(--fail)", opacity: usedCols.has(c.key) ? 0.4 : 1 }}
                          >
                            <Icon icon={X} className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
            <button onClick={addColumn} disabled={cols.length >= 40} style={{ ...smallBtn, color: "var(--accent)", borderColor: "var(--accent)" }}>
              <Icon icon={Plus} className="h-3.5 w-3.5" /> เพิ่มคอลัมน์
            </button>
            {keyCol && <button onClick={() => setKeyCol(null)} style={smallBtn}>ไม่ใช้ key</button>}
          </div>
        )}

        <label style={label}>เมื่อนำเข้าข้อมูลใหม่</label>
        <select value={mode} disabled={!canEdit} onChange={(e) => setMode(e.target.value === "upsert" ? "upsert" : "replace")} style={selectStyle}>
          <option value="replace">แทนที่ทั้งชุด (ข้อมูลที่ไม่มีในรอบใหม่จะหายไป)</option>
          <option value="upsert" disabled={!keyCol}>อัปเดตตาม key (เพิ่มใหม่ / แก้ของเดิม / ไม่ลบ){!keyCol ? " — ต้องเลือก key" : ""}</option>
        </select>

        {canEdit && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <Button
              variant="primary"
              disabled={!dirty || cols.some((c) => !isValidColumnKey(c.key))}
              loading={busy === "save"}
              onClick={() => run("save", () => updateDataset(ds.id, { name, description: desc, columns: cols, keyColumn: keyCol, syncMode: mode }), "บันทึกแล้ว")}
            >
              <Icon icon={Save} className="h-4 w-4" /> บันทึก
            </Button>
            {dirty && <Button onClick={() => { setName(ds.name); setDesc(ds.description); setCols(ds.columns); setKeyCol(ds.keyColumn); setMode(ds.syncMode); }}>ยกเลิกการแก้</Button>}
          </div>
        )}
      </Card>

      {/* ---------- ข้อมูล ---------- */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <b style={{ fontFamily: "var(--font-anuphan)" }}>ข้อมูล</b>
          <div style={{ position: "relative", minWidth: 200, flex: "0 1 280px" }}>
            <Field value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาในตัวอย่าง" style={{ paddingLeft: 30, width: "100%" }} />
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", display: "flex" }}><Icon icon={Search} className="h-4 w-4" /></span>
          </div>
        </div>
        <p style={{ fontSize: ".78rem", color: "var(--ink-3)", margin: "4px 0 10px" }}>
          แสดง {Math.min(rows.length, previewLimit).toLocaleString()} แถวแรกจาก {ds.rowCount.toLocaleString()} แถว
        </p>
        {rows.length === 0 ? (
          <p style={{ fontSize: ".88rem", color: "var(--ink-3)" }}>ยังไม่มีข้อมูล</p>
        ) : (
          <div style={{ ...tableWrap, maxHeight: 420, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0 }}>
                <tr>{ds.columns.map((c) => <th key={c.key} style={th}>{c.label}{ds.keyColumn === c.key && " 🔑"}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.slice(0, previewLimit).map((r, i) => (
                  <tr key={i}>{ds.columns.map((c) => <td key={c.key} style={td} title={cellText(r[c.key])}>{cellText(r[c.key])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && ds.rowCount > 0 && (
          <button
            style={{ ...smallBtn, marginTop: 10, color: "var(--fail)" }}
            disabled={busy === "clear"}
            onClick={() => { if (confirm(`ล้างข้อมูลทั้ง ${ds.rowCount.toLocaleString()} แถว? (คอลัมน์ยังอยู่) dropdown ในฟอร์มที่ใช้ชุดนี้จะไม่มีตัวเลือกจนกว่าจะนำเข้าใหม่`)) void run("clear", () => clearRows(ds.id), "ล้างข้อมูลแล้ว"); }}
          >
            <Icon icon={Eraser} className="h-3.5 w-3.5" /> ล้างข้อมูลทั้งหมด
          </button>
        )}
      </Card>

      {/* ---------- ฟอร์มที่ใช้ ---------- */}
      <Card>
        <b style={{ fontFamily: "var(--font-anuphan)" }}>ฟอร์มที่ใช้ชุดข้อมูลนี้</b>
        {usedBy.length === 0 ? (
          <p style={{ fontSize: ".85rem", color: "var(--ink-3)", margin: "6px 0 0" }}>
            ยังไม่มี — ไปที่ สร้างฟอร์ม → เลือกฟิลด์ “เลือก 1 ข้อ” หรือ “เลือกหลายข้อ” → ตัวเลือกจาก “ข้อมูลอ้างอิง”
          </p>
        ) : (
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {usedBy.map((f) => (
              <Link key={f.id} href="/studio" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: ".88rem", color: "var(--ink)", textDecoration: "none" }}>
                <Icon icon={FileText} className="h-4 w-4" /> {f.icon} {f.title}
                <span style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>({f.columns.map((k) => ds.columns.find((c) => c.key === k)?.label || k).join(", ")})</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* ---------- ประวัติ ---------- */}
      {canEdit && (
        <Card>
          <b style={{ fontFamily: "var(--font-anuphan)", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon icon={History} className="h-4 w-4" /> ประวัติการนำเข้า</b>
          {runs.length === 0 ? (
            <p style={{ fontSize: ".85rem", color: "var(--ink-3)", margin: "6px 0 0" }}>ยังไม่มี</p>
          ) : (
            <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
              {runs.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 8, fontSize: ".8rem", flexWrap: "wrap", color: r.status === "error" ? "var(--fail)" : "var(--ink-2)" }}>
                  <span style={{ color: "var(--ink-3)", minWidth: 110 }}>{fmtTime(r.created_at)}</span>
                  <span style={{ minWidth: 64 }}>{KIND_LABEL[r.kind] || r.kind}</span>
                  <span style={{ flex: 1, minWidth: 160, wordBreak: "break-word" }}>{r.status === "error" ? "✗ " : "✓ "}{r.message}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {canEdit && (
        <div>
          <Button
            variant="danger"
            loading={busy === "delete"}
            disabled={usedBy.length > 0}
            onClick={async () => {
              if (!confirm(`ลบ “${ds.name}” และข้อมูลทั้งหมด? ย้อนกลับไม่ได้`)) return;
              setBusy("delete");
              const res = await deleteDataset(ds.id);
              setBusy(null);
              if ("error" in res) setMsg({ t: res.error, err: true });
              else router.push("/datasets");
            }}
          >
            <Icon icon={Trash2} className="h-4 w-4" /> ลบชุดข้อมูล
          </Button>
          {usedBy.length > 0 && <span style={{ fontSize: ".78rem", color: "var(--ink-3)", marginLeft: 8 }}>ลบไม่ได้ขณะที่ยังมีฟอร์มใช้อยู่</span>}
        </div>
      )}
    </div>
  );
}
