"use client";
import { useRef, useState } from "react";
import { Card, Button, Field, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { MAX_DATASET_ROWS, cellText, type DatasetColumn, type DatasetMeta, type DatasetRecord, type DatasetSyncMode } from "@/lib/datasets";
import { label, selectStyle, tableWrap, td, th } from "../ui";
import { confirmDialog } from "@/components/dialogs";
import { useT } from "@/i18n/LanguageProvider";

interface Preview {
  sheets: string[];
  columns: DatasetColumn[];
  mapping: (string | null)[];
  total: number;
  tooMany: boolean;
  sample: DatasetRecord[];
}

export default function FileImportPanel({ ds, onDone }: { ds: DatasetMeta; onDone: () => void }) {
  const { t, tt } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  // นำเข้าครั้งแรก: แก้ label/type และเลือกคอลัมน์ได้
  const [cols, setCols] = useState<(DatasetColumn & { include: boolean })[]>([]);
  const [keyCol, setKeyCol] = useState<string>("");
  const [mode, setMode] = useState<DatasetSyncMode>(ds.syncMode);
  const [addNew, setAddNew] = useState(true);
  const [busy, setBusy] = useState<"" | "preview" | "import">("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const first = ds.columns.length === 0;

  async function post(action: "preview" | "import", f: File, sh: string) {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("dataset_id", ds.id);
    fd.append("action", action);
    if (sh) fd.append("sheet", sh);
    if (action === "import") {
      fd.append("mode", mode);
      if (first) {
        fd.append("columns", JSON.stringify(cols.filter((c) => c.include).map(({ key, label, type }) => ({ key, label, type }))));
        fd.append("key_column", keyCol);
      }
      if (addNew) fd.append("add_new_columns", "1");
    }
    const res = await fetch("/api/datasets/file", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({ error: t("ds.file.badResponse") }));
    if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
    return j;
  }

  async function loadPreview(f: File, sh = "") {
    setBusy("preview");
    setErr("");
    setDone("");
    try {
      const j = (await post("preview", f, sh)) as Preview;
      setPreview(j);
      setCols(j.columns.map((c) => ({ ...c, include: true })));
      setKeyCol("");
    } catch (e) {
      setPreview(null);
      setErr(e instanceof Error ? e.message : t("ds.file.readFailed"));
    } finally {
      setBusy("");
    }
  }

  async function doImport() {
    if (!file) return;
    if (mode === "replace" && ds.rowCount > 0 && !(await confirmDialog({ message: tt("ds.file.replaceConfirm", { n: ds.rowCount.toLocaleString() }), confirmLabel: t("ds.file.replaceBtn"), danger: true }))) return;
    setBusy("import");
    setErr("");
    try {
      const j = await post("import", file, sheet);
      setDone(tt("ds.file.imported", { n: Number(j.imported).toLocaleString(), total: Number(j.rows).toLocaleString() }));
      setPreview(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("ds.file.importFailed"));
    } finally {
      setBusy("");
    }
  }

  const matched = preview ? preview.mapping.filter(Boolean).length : 0;
  const keyOk = !first ? !!ds.keyColumn : !!keyCol;

  return (
    <Card>
      <b style={{ fontFamily: "var(--font-anuphan)", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon icon={FileSpreadsheet} className="h-4 w-4" /> {t("ds.file.title")}
      </b>
      <p style={{ fontSize: ".82rem", color: "var(--ink-2)", margin: "4px 0 10px" }}>
        {tt("ds.file.hint", { n: MAX_DATASET_ROWS.toLocaleString() })}
        {!first && t("ds.file.hintMatch")}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          setFile(f);
          setSheet("");
          if (f) void loadPreview(f);
        }}
      />
      <Button onClick={() => inputRef.current?.click()} loading={busy === "preview"}>
        <Icon icon={Upload} className="h-4 w-4" /> {file ? file.name : t("ds.file.choose")}
      </Button>

      {err && <Notice kind="error">{err}</Notice>}
      {done && <p style={{ color: "var(--pass)", fontSize: ".88rem", display: "flex", alignItems: "center", gap: 6 }}><Icon icon={CheckCircle2} className="h-4 w-4" /> {done}</p>}

      {preview && file && (
        <div style={{ marginTop: 12 }}>
          {preview.sheets.length > 1 && (
            <>
              <label style={label}>{t("ds.file.sheet")}</label>
              <select value={sheet || preview.sheets[0]} onChange={(e) => { setSheet(e.target.value); void loadPreview(file, e.target.value); }} style={selectStyle}>
                {preview.sheets.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </>
          )}

          <p style={{ fontSize: ".85rem", margin: "10px 0 6px" }}>
            {t("ds.file.found")}<b>{preview.total.toLocaleString()}</b>{tt("ds.file.foundRest", { cols: preview.columns.length })}
            {!first && <>{tt("ds.file.matched", { n: matched })}</>}
          </p>
          {preview.tooMany && <Notice kind="error">{tt("ds.file.tooMany", { n: MAX_DATASET_ROWS.toLocaleString() })}</Notice>}

          {first ? (
            <div style={tableWrap}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>{t("ds.col.use")}</th>
                    <th style={th}>{t("ds.file.header")}</th>
                    <th style={th}>{t("ds.col.type")}</th>
                    <th style={th}>key</th>
                    <th style={th}>{t("ds.col.sample")}</th>
                  </tr>
                </thead>
                <tbody>
                  {cols.map((c, i) => (
                    <tr key={c.key} style={{ opacity: c.include ? 1 : 0.5 }}>
                      <td style={td}><input type="checkbox" checked={c.include} onChange={(e) => setCols(cols.map((x, xi) => (xi === i ? { ...x, include: e.target.checked } : x)))} /></td>
                      <td style={{ ...td, minWidth: 150 }}><Field value={c.label} onChange={(e) => setCols(cols.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))} style={{ padding: "5px 8px", fontSize: ".84rem" }} /></td>
                      <td style={td}>
                        <select value={c.type} onChange={(e) => setCols(cols.map((x, xi) => (xi === i ? { ...x, type: e.target.value === "number" ? "number" : "text" } : x)))} style={{ ...selectStyle, padding: "4px 6px" }}>
                          <option value="text">{t("ds.type.text")}</option>
                          <option value="number">{t("ds.type.number")}</option>
                        </select>
                      </td>
                      <td style={td}><input type="radio" name="fkey" checked={keyCol === c.key} disabled={!c.include} onChange={() => setKeyCol(c.key)} /></td>
                      <td style={{ ...td, color: "var(--ink-3)" }}>{preview.sample.slice(0, 3).map((r) => cellText(r[c.key])).filter(Boolean).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {preview.columns.map((c, i) => {
                  const to = preview.mapping[i];
                  const target = ds.columns.find((x) => x.key === to);
                  return (
                    <span key={c.key} style={{ fontSize: ".78rem", borderRadius: 999, padding: "3px 10px", border: `1px solid ${target ? "var(--pass)" : "var(--line)"}`, color: target ? "var(--ink)" : "var(--ink-3)" }}>
                      {c.label}{target ? ` → ${target.label}` : addNew ? t("ds.file.newCol") : t("ds.file.skip")}
                    </span>
                  );
                })}
              </div>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: ".85rem", marginTop: 8 }}>
                <input type="checkbox" checked={addNew} onChange={(e) => setAddNew(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                {t("ds.file.addNewCols")}
              </label>
            </>
          )}

          <label style={label}>{t("ds.file.method")}</label>
          <select value={mode} onChange={(e) => setMode(e.target.value === "upsert" ? "upsert" : "replace")} style={selectStyle}>
            <option value="replace">{t("ds.mode.replace")}</option>
            <option value="upsert" disabled={!keyOk}>{t("ds.mode.upsert")}{!keyOk ? t("ds.mode.needKey") : ""}</option>
          </select>

          <div style={{ marginTop: 14 }}>
            <Button
              variant="primary"
              onClick={doImport}
              loading={busy === "import"}
              disabled={preview.tooMany || (first && !cols.some((c) => c.include)) || (mode === "upsert" && !keyOk)}
            >
              {tt("ds.file.importN", { n: preview.total.toLocaleString() })}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
