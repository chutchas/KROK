"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Field, EmptyState, Notice } from "@/components/ui";
import Icon from "@/components/Icon";
import { Database, Plus, ChevronRight } from "lucide-react";
import { SOURCE_LABEL, type DatasetMeta, type DatasetSourceKind } from "@/lib/datasets";
import type { MessageKey } from "@/i18n/dictionaries";
import { useT } from "@/i18n/LanguageProvider";
import { createDataset } from "./actions";
import { SOURCE_ICON, SOURCE_KEY, SyncBadge, label } from "./ui";

const KIND_HELP: Record<DatasetSourceKind, MessageKey> = {
  file: "ds.kindHelp.file",
  api_pull: "ds.kindHelp.apiPull",
  api_push: "ds.kindHelp.apiPush",
};

export default function DatasetsClient({ items, canEdit, missingTable }: { items: DatasetMeta[]; canEdit: boolean; missingTable: boolean }) {
  const { t, tt } = useT();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DatasetSourceKind>("file");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    setBusy(true);
    setErr("");
    const res = await createDataset({ name, sourceKind: kind });
    setBusy(false);
    if ("error" in res) setErr(res.error);
    else router.push(`/datasets/${res.id}`);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", marginBottom: 2 }}>{t("nav.datasets")}</h1>
          <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>
            {t("ds.subtitle")}
          </p>
        </div>
        {canEdit && !creating && (
          <Button data-tour="ds-create" variant="primary" onClick={() => setCreating(true)} disabled={missingTable}>
            <Icon icon={Plus} className="h-4 w-4" /> {t("ds.create")}
          </Button>
        )}
      </div>

      {missingTable && (
        <Notice kind="error">{t("ds.missingTable1")}<code>0030_datasets.sql</code>{t("ds.missingTable2")}</Notice>
      )}

      {creating && (
        <Card>
          <b style={{ fontFamily: "var(--font-anuphan)" }}>{t("ds.createNew")}</b>
          <label style={label}>{t("ds.name")}</label>
          <Field value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ds.namePlaceholder")} maxLength={120} autoFocus />
          <label style={label}>{t("ds.sourceFrom")}</label>
          <div style={{ display: "grid", gap: 8 }}>
            {(Object.keys(SOURCE_LABEL) as DatasetSourceKind[]).map((k) => (
              <label key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", border: `1px solid ${kind === k ? "var(--accent)" : "var(--line)"}`, background: kind === k ? "var(--accent-soft)" : "var(--surface)", borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
                <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} style={{ marginTop: 3, accentColor: "var(--accent)" }} />
                <Icon icon={SOURCE_ICON[k]} className="h-5 w-5" />
                <span>
                  <b style={{ fontSize: ".92rem" }}>{t(SOURCE_KEY[k])}</b>
                  <span style={{ display: "block", fontSize: ".8rem", color: "var(--ink-2)" }}>{t(KIND_HELP[k])}</span>
                </span>
              </label>
            ))}
          </div>
          {err && <p style={{ color: "var(--fail)", fontSize: ".85rem" }}>{err}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button variant="primary" onClick={create} loading={busy} disabled={!name.trim()}>{t("ds.createBtn")}</Button>
            <Button onClick={() => { setCreating(false); setErr(""); }}>{t("common.cancel")}</Button>
          </div>
        </Card>
      )}

      {items.length === 0 && !creating ? (
        <Card><EmptyState icon={<Icon icon={Database} className="h-8 w-8" />} title={t("ds.emptyTitle")} hint={t("ds.emptyHint")} /></Card>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((d) => (
            <Link key={d.id} href={`/datasets/${d.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", background: "var(--surface)" }}>
                <Icon icon={Database} className="h-5 w-5" />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <b style={{ fontFamily: "var(--font-anuphan)" }}>{d.name}</b>
                  <div style={{ fontSize: ".78rem", color: "var(--ink-3)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Icon icon={SOURCE_ICON[d.sourceKind]} className="h-3.5 w-3.5" /> {t(SOURCE_KEY[d.sourceKind])}
                    {d.pullHost && <> · {d.pullHost}</>}
                    {" · "}{tt("ds.rowsCols", { rows: d.rowCount.toLocaleString(), cols: d.columns.length })}
                  </div>
                </div>
                <SyncBadge ds={d} />
                <Icon icon={ChevronRight} className="h-4 w-4" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
