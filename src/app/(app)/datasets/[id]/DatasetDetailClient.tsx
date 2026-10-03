"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Field, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { ArrowLeft, Trash2, Save, Plus, X, KeyRound, Search, Eraser, History, FileText } from "lucide-react";
import {
  cellText,
  isValidColumnKey,
  slugKey,
  type DatasetColumn,
  type DatasetMeta,
  type DatasetRecord,
  type DatasetSyncMode,
} from "@/lib/datasets";
import { clearRows, deleteDataset, updateDataset } from "../actions";
import type { DsAnyKey as MessageKey } from "@/i18n/ns/ds";
import { useDsT as useT } from "@/i18n/ns/ds";
import { SOURCE_ICON, SOURCE_KEY, SyncBadge, fmtTime, label, selectStyle, smallBtn, tableWrap, td, th } from "../ui";
import FileImportPanel from "./FileImportPanel";
import PullPanel from "./PullPanel";
import PushPanel from "./PushPanel";
import { confirmDialog } from "@/components/dialogs";

export interface SyncRun {
  id: number;
  kind: "manual" | "file" | "schedule" | "push";
  status: "ok" | "error";
  rows_in: number;
  message: string;
  created_at: string;
}

const KIND_LABEL: Record<SyncRun["kind"], MessageKey> = { manual: "ds.run.manual", file: "ds.run.file", schedule: "ds.run.schedule", push: "ds.run.push" };

export default function DatasetDetailClient({
  ds,
  rows,
  previewLimit,
  runs,
  usedBy,
  canEdit,
  maxRows,
}: {
  ds: DatasetMeta;
  rows: DatasetRecord[];
  previewLimit: number;
  runs: SyncRun[];
  usedBy: { id: string; title: string; icon: string; columns: string[] }[];
  canEdit: boolean;
  /** แถวต่อถังสูงสุดตามแพ็กเกจ */
  maxRows: number;
}) {
  const { t, tt, lang } = useT();
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
          <Icon icon={ArrowLeft} className="h-4 w-4" /> {t("ds.backAll")}
        </Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <h1 style={{ fontSize: "1.35rem", margin: 0 }}>{ds.name}</h1>
          <SyncBadge ds={ds} />
        </div>
        <div style={{ fontSize: ".82rem", color: "var(--ink-3)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
          <Icon icon={SOURCE_ICON[ds.sourceKind]} className="h-3.5 w-3.5" /> {t(SOURCE_KEY[ds.sourceKind])} · {tt("ds.rows", { n: ds.rowCount.toLocaleString() })}
          {ds.lastSyncStatus === "error" && ds.lastSyncError && <span style={{ color: "var(--fail)" }}>· {ds.lastSyncError}</span>}
        </div>
      </div>

      {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

      {/* ---------- แหล่งข้อมูล ---------- */}
      {canEdit && ds.sourceKind === "file" && <FileImportPanel ds={ds} maxRows={maxRows} onDone={() => router.refresh()} />}
      {canEdit && ds.sourceKind === "api_pull" && <PullPanel ds={ds} usedCols={usedCols} onDone={() => router.refresh()} />}
      {canEdit && ds.sourceKind === "api_push" && <PushPanel ds={ds} maxRows={maxRows} />}

      {/* ---------- คอลัมน์และการตั้งค่า ---------- */}
      <Card>
        <b style={{ fontFamily: "var(--font-anuphan)" }}>{t("ds.settingsCols")}</b>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <div>
            <label style={label}>{t("ds.name")}</label>
            <Field value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} maxLength={120} />
          </div>
          <div>
            <label style={label}>{t("ds.description")}</label>
            <Field value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!canEdit} maxLength={500} />
          </div>
        </div>

        <label style={label}>{t("ds.columns")}</label>
        {cols.length === 0 ? (
          <p style={{ fontSize: ".85rem", color: "var(--ink-3)", margin: 0 }}>
            {t("ds.noColumns")}{ds.sourceKind === "file" ? t("ds.noColumns.file") : ds.sourceKind === "api_pull" ? t("ds.noColumns.apiPull") : t("ds.noColumns.apiPush")}
          </p>
        ) : (
          <div style={tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>{t("ds.col.label")}</th>
                  <th style={th}>{t("ds.col.type")}</th>
                  <th style={th}>{t("ds.col.key")}</th>
                  <th style={th} title={t("ds.col.keyHint")}><Icon icon={KeyRound} className="h-3.5 w-3.5" /> key</th>
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
                          <option value="text">{t("ds.type.text")}</option>
                          <option value="number">{t("ds.type.number")}</option>
                        </select>
                      </td>
                      <td style={td}>
                        {isNew && canEdit ? (
                          <Field value={c.key} onChange={(e) => setCols(cols.map((x, xi) => (xi === i ? { ...x, key: e.target.value.toLowerCase() } : x)))} style={{ padding: "6px 8px", fontSize: ".82rem", fontFamily: "monospace", borderColor: isValidColumnKey(c.key) ? undefined : "var(--fail)" }} />
                        ) : (
                          <code style={{ fontSize: ".8rem" }}>{c.key}</code>
                        )}
                        {usedCols.has(c.key) && <span style={{ fontSize: ".7rem", color: "var(--accent-text)", marginLeft: 6 }}>{t("ds.usedByForm")}</span>}
                      </td>
                      <td style={td}>
                        <input type="radio" name="keycol" checked={keyCol === c.key} disabled={!canEdit} onChange={() => setKeyCol(c.key)} style={{ accentColor: "var(--accent)" }} />
                      </td>
                      <td style={td}>
                        {canEdit && (
                          <button
                            onClick={() => { setCols(cols.filter((_, xi) => xi !== i)); if (keyCol === c.key) setKeyCol(null); }}
                            disabled={usedCols.has(c.key)}
                            title={usedCols.has(c.key) ? t("ds.colInUse") : t("ds.deleteCol")}
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
            <button onClick={addColumn} disabled={cols.length >= 40} style={{ ...smallBtn, color: "var(--accent-text)", borderColor: "var(--accent)" }}>
              <Icon icon={Plus} className="h-3.5 w-3.5" /> {t("ds.addCol")}
            </button>
            {keyCol && <button onClick={() => setKeyCol(null)} style={smallBtn}>{t("ds.noKey")}</button>}
          </div>
        )}

        <label style={label}>{t("ds.onImport")}</label>
        <select value={mode} disabled={!canEdit} onChange={(e) => setMode(e.target.value === "upsert" ? "upsert" : "replace")} style={selectStyle}>
          <option value="replace">{t("ds.mode.replaceLong")}</option>
          <option value="upsert" disabled={!keyCol}>{t("ds.mode.upsertLong")}{!keyCol ? t("ds.mode.needKeyCol") : ""}</option>
        </select>

        {canEdit && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <Button
              variant="primary"
              disabled={!dirty || cols.some((c) => !isValidColumnKey(c.key))}
              loading={busy === "save"}
              onClick={() => run("save", () => updateDataset(ds.id, { name, description: desc, columns: cols, keyColumn: keyCol, syncMode: mode }), t("common.saved"))}
            >
              <Icon icon={Save} className="h-4 w-4" /> {t("common.save")}
            </Button>
            {dirty && <Button onClick={() => { setName(ds.name); setDesc(ds.description); setCols(ds.columns); setKeyCol(ds.keyColumn); setMode(ds.syncMode); }}>{t("ds.discard")}</Button>}
          </div>
        )}
      </Card>

      {/* ---------- ข้อมูล ---------- */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <b style={{ fontFamily: "var(--font-anuphan)" }}>{t("ds.data")}</b>
          <div style={{ position: "relative", minWidth: 200, flex: "0 1 280px" }}>
            <Field value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ds.searchPreview")} style={{ paddingLeft: 30, width: "100%" }} />
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", display: "flex" }}><Icon icon={Search} className="h-4 w-4" /></span>
          </div>
        </div>
        <p style={{ fontSize: ".78rem", color: "var(--ink-3)", margin: "4px 0 10px" }}>
          {tt("ds.previewOf", { n: Math.min(rows.length, previewLimit).toLocaleString(), total: ds.rowCount.toLocaleString() })}
        </p>
        {rows.length === 0 ? (
          <p style={{ fontSize: ".88rem", color: "var(--ink-3)" }}>{t("common.none")}</p>
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
            onClick={async () => { if (await confirmDialog({ message: tt("ds.clearConfirm", { n: ds.rowCount.toLocaleString() }), confirmLabel: t("ds.clearBtn"), danger: true })) void run("clear", () => clearRows(ds.id), t("ds.cleared")); }}
          >
            <Icon icon={Eraser} className="h-3.5 w-3.5" /> {t("ds.clearAll")}
          </button>
        )}
      </Card>

      {/* ---------- ฟอร์มที่ใช้ ---------- */}
      <Card>
        <b style={{ fontFamily: "var(--font-anuphan)" }}>{t("ds.usedByTitle")}</b>
        {usedBy.length === 0 ? (
          <p style={{ fontSize: ".85rem", color: "var(--ink-3)", margin: "6px 0 0" }}>
            {t("ds.usedByEmpty")}
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
          <b style={{ fontFamily: "var(--font-anuphan)", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon icon={History} className="h-4 w-4" /> {t("ds.history")}</b>
          {runs.length === 0 ? (
            <p style={{ fontSize: ".85rem", color: "var(--ink-3)", margin: "6px 0 0" }}>{t("ds.nothingYet")}</p>
          ) : (
            <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
              {runs.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 8, fontSize: ".8rem", flexWrap: "wrap", color: r.status === "error" ? "var(--fail)" : "var(--ink-2)" }}>
                  <span style={{ color: "var(--ink-3)", minWidth: 110 }}>{fmtTime(r.created_at, lang)}</span>
                  <span style={{ minWidth: 64 }}>{KIND_LABEL[r.kind] ? t(KIND_LABEL[r.kind]) : r.kind}</span>
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
              if (!(await confirmDialog({ message: tt("ds.deleteConfirm", { name: ds.name }), danger: true }))) return;
              setBusy("delete");
              const res = await deleteDataset(ds.id);
              setBusy(null);
              if ("error" in res) setMsg({ t: res.error, err: true });
              else router.push("/datasets");
            }}
          >
            <Icon icon={Trash2} className="h-4 w-4" /> {t("ds.delete")}
          </Button>
          {usedBy.length > 0 && <span style={{ fontSize: ".78rem", color: "var(--ink-3)", marginLeft: 8 }}>{t("ds.deleteBlocked")}</span>}
        </div>
      )}
    </div>
  );
}
