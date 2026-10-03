"use client";
import { useEffect, useState } from "react";
import { Card, Button, Field, TextArea, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { DownloadCloud, Plus, X, PlayCircle, RefreshCw, Save, Clock } from "lucide-react";
import { SCHEDULE_CHOICES, slugKey, type DatasetColType, type DatasetMeta } from "@/lib/datasets";
import { getPullConfig, savePullConfig, syncNow, testPull, updateDataset, type PullTestResult } from "../actions";
import type { DsAnyKey as MessageKey } from "@/i18n/ns/ds";
import { useDsT as useT } from "@/i18n/ns/ds";
import { fmtTime, label, selectStyle, smallBtn, tableWrap, td, th } from "../ui";

const SCHEDULE_KEY: Record<number, MessageKey> = {
  0: "ds.schedule.off",
  15: "ds.schedule.m15",
  60: "ds.schedule.h1",
  360: "ds.schedule.h6",
  1440: "ds.schedule.daily",
};

interface FieldRow { path: string; include: boolean; key: string; label: string; type: DatasetColType }

export default function PullPanel({ ds, usedCols, onDone }: { ds: DatasetMeta; usedCols: Set<string>; onDone: () => void }) {
  const { t, tt, lang } = useT();
  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [headers, setHeaders] = useState<{ name: string; value: string }[]>([]);
  const [body, setBody] = useState("");
  const [path, setPath] = useState("");
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [keyCol, setKeyCol] = useState<string>(ds.keyColumn || "");
  const [test, setTest] = useState<PullTestResult | null>(null);
  const [schedule, setSchedule] = useState(ds.scheduleMinutes);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    getPullConfig(ds.id).then((res) => {
      if (!alive) return;
      if ("error" in res) { setMsg({ t: res.error, err: true }); setLoaded(true); return; }
      const c = res.config;
      setUrl(c.url);
      setMethod(c.method);
      setHeaders(c.headers.map((h) => ({ name: h.name, value: h.value })));
      setBody(c.body || "");
      setPath(c.records_path);
      setFields(
        c.field_map.map((m) => {
          const col = ds.columns.find((x) => x.key === m.column);
          return { path: m.path, include: true, key: m.column, label: col?.label || m.path, type: col?.type || "text" };
        })
      );
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [ds.id, ds.columns]);

  const config = () => ({
    url: url.trim(),
    method,
    headers: headers.filter((h) => h.name.trim()),
    body: method === "POST" ? body : undefined,
    records_path: path.trim(),
    field_map: fields.filter((f) => f.include).map((f) => ({ column: f.key, path: f.path })),
  });

  async function runTest() {
    setBusy("test");
    setMsg(null);
    const res = await testPull(ds.id, config());
    setBusy("");
    if ("error" in res) { setTest(null); setMsg({ t: res.error, err: true }); return; }
    setTest(res.result);
    // รวมฟิลด์ที่เจอใหม่เข้ากับที่เลือกไว้เดิม (ของเดิมคง key/label ไว้ — ฟอร์มอ้างอิง key)
    setFields((prev) => {
      const had = prev.length > 0;
      const used = new Set(prev.map((p) => p.key));
      const next = [...prev];
      res.result.paths.forEach((p, i) => {
        if (next.some((f) => f.path === p)) return;
        const sug = res.result.suggested.columns[res.result.suggested.field_map.findIndex((m) => m.path === p)];
        next.push({ path: p, include: !had, key: slugKey(p, next.length + i, used), label: p, type: sug?.type || "text" });
      });
      return next;
    });
  }

  async function save() {
    const chosen = fields.filter((f) => f.include);
    setBusy("save");
    setMsg(null);
    const cols = chosen.map((f) => ({ key: f.key, label: f.label || f.path, type: f.type }));
    const res = await savePullConfig(ds.id, config(), cols, keyCol && chosen.some((f) => f.key === keyCol) ? keyCol : null);
    setBusy("");
    if ("error" in res) setMsg({ t: res.error, err: true });
    else { setMsg({ t: t("ds.pull.savedMsg") }); onDone(); }
  }

  async function sync() {
    setBusy("sync");
    setMsg(null);
    const res = await syncNow(ds.id);
    setBusy("");
    if ("error" in res) setMsg({ t: res.error, err: true });
    else { setMsg({ t: tt("ds.pull.syncedMsg", { n: res.rows.toLocaleString() }) }); onDone(); }
  }

  async function saveSchedule(m: number) {
    setSchedule(m);
    const res = await updateDataset(ds.id, { scheduleMinutes: m });
    if ("error" in res) setMsg({ t: res.error, err: true });
    else onDone();
  }

  if (!loaded) return <Card><span style={{ color: "var(--ink-3)", fontSize: ".88rem" }}>{t("ds.pull.loading")}</span></Card>;

  return (
    <Card>
      <b style={{ fontFamily: "var(--font-anuphan)", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon icon={DownloadCloud} className="h-4 w-4" /> {t("ds.pull.title")}
      </b>
      <p style={{ fontSize: ".8rem", color: "var(--ink-2)", margin: "4px 0 0" }}>
        {t("ds.pull.hint")}
      </p>

      <label style={label}>URL</label>
      <div style={{ display: "flex", gap: 6 }}>
        <select value={method} onChange={(e) => setMethod(e.target.value === "POST" ? "POST" : "GET")} style={{ ...selectStyle, flex: "0 0 auto" }}>
          <option>GET</option>
          <option>POST</option>
        </select>
        <Field value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://erp.example.com/api/customers" style={{ flex: 1, minWidth: 0 }} />
      </div>

      <label style={label}>{t("ds.pull.headers")}</label>
      <div style={{ display: "grid", gap: 6 }}>
        {headers.map((h, i) => (
          <div key={i} style={{ display: "flex", gap: 6 }}>
            <Field value={h.name} onChange={(e) => setHeaders(headers.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))} placeholder={t("ds.pull.headerName")} style={{ flex: "0 1 180px", minWidth: 0 }} />
            <Field value={h.value} type="password" onChange={(e) => setHeaders(headers.map((x, xi) => (xi === i ? { ...x, value: e.target.value } : x)))} placeholder={t("ds.pull.headerValue")} style={{ flex: 1, minWidth: 0 }} />
            <button onClick={() => setHeaders(headers.filter((_, xi) => xi !== i))} style={{ ...smallBtn, color: "var(--fail)" }}><Icon icon={X} className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {headers.length < 10 && (
          <button onClick={() => setHeaders([...headers, { name: "", value: "" }])} style={{ ...smallBtn, justifySelf: "start" }}>
            <Icon icon={Plus} className="h-3.5 w-3.5" /> {t("ds.pull.addHeader")}
          </button>
        )}
      </div>

      {method === "POST" && (
        <>
          <label style={label}>Body (JSON)</label>
          <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder='{"status":"active"}' style={{ fontFamily: "monospace", fontSize: ".82rem" }} />
        </>
      )}

      <label style={label}>{t("ds.pull.path")}</label>
      <Field value={path} onChange={(e) => setPath(e.target.value)} placeholder={t("ds.pull.pathPlaceholder")} />

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Button onClick={runTest} loading={busy === "test"} disabled={!url.trim()}>
          <Icon icon={PlayCircle} className="h-4 w-4" /> {t("ds.pull.test")}
        </Button>
      </div>

      {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}

      {test && (
        <p style={{ fontSize: ".85rem", margin: "10px 0 0" }}>
          {t("ds.pull.got")}<b>{test.total.toLocaleString()}</b>{tt("ds.pull.gotItems", { n: test.paths.length })}
        </p>
      )}

      {fields.length > 0 && (
        <>
          <label style={label}>{t("ds.pull.fields")}</label>
          <div style={tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>{t("ds.col.use")}</th>
                  <th style={th}>{t("ds.pull.apiField")}</th>
                  <th style={th}>{t("ds.col.label")}</th>
                  <th style={th}>{t("ds.col.type")}</th>
                  <th style={th}>key</th>
                  {test && <th style={th}>{t("ds.col.sample")}</th>}
                </tr>
              </thead>
              <tbody>
                {fields.map((f, i) => {
                  const locked = usedCols.has(f.key) && f.include;
                  return (
                    <tr key={f.path} style={{ opacity: f.include ? 1 : 0.55 }}>
                      <td style={td}>
                        <input type="checkbox" checked={f.include} disabled={locked} title={locked ? t("ds.pull.fieldInUse") : ""} onChange={(e) => setFields(fields.map((x, xi) => (xi === i ? { ...x, include: e.target.checked } : x)))} />
                      </td>
                      <td style={td}><code style={{ fontSize: ".78rem" }}>{f.path}</code></td>
                      <td style={{ ...td, minWidth: 140 }}><Field value={f.label} onChange={(e) => setFields(fields.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))} style={{ padding: "5px 8px", fontSize: ".84rem" }} /></td>
                      <td style={td}>
                        <select value={f.type} onChange={(e) => setFields(fields.map((x, xi) => (xi === i ? { ...x, type: e.target.value === "number" ? "number" : "text" } : x)))} style={{ ...selectStyle, padding: "4px 6px" }}>
                          <option value="text">{t("ds.type.text")}</option>
                          <option value="number">{t("ds.type.number")}</option>
                        </select>
                      </td>
                      <td style={td}><input type="radio" name="pkey" checked={keyCol === f.key} disabled={!f.include} onChange={() => setKeyCol(f.key)} /></td>
                      {test && <td style={{ ...td, color: "var(--ink-3)" }}>{test.sample.slice(0, 3).map((s) => s[f.path]).filter(Boolean).join(" · ")}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={save} loading={busy === "save"} disabled={!fields.some((f) => f.include)}>
              <Icon icon={Save} className="h-4 w-4" /> {t("ds.pull.save")}
            </Button>
            <Button onClick={sync} loading={busy === "sync"} disabled={!ds.pullHost}>
              <Icon icon={RefreshCw} className="h-4 w-4" /> {t("ds.pull.syncNow")}
            </Button>
          </div>
        </>
      )}

      <label style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}><Icon icon={Clock} className="h-3.5 w-3.5" /> {t("ds.pull.schedule")}</label>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select value={schedule} onChange={(e) => void saveSchedule(Number(e.target.value))} disabled={!ds.pullHost} style={selectStyle}>
          {SCHEDULE_CHOICES.map((c) => <option key={c.minutes} value={c.minutes}>{SCHEDULE_KEY[c.minutes] ? t(SCHEDULE_KEY[c.minutes]) : c.label}</option>)}
        </select>
        {ds.scheduleMinutes > 0 && <span style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{tt("ds.pull.nextRun", { time: fmtTime(ds.nextSyncAt, lang) })}</span>}
      </div>
      {!ds.pullHost && <p style={{ fontSize: ".76rem", color: "var(--ink-3)", margin: "4px 0 0" }}>{t("ds.pull.scheduleNeedsConfig")}</p>}
    </Card>
  );
}
