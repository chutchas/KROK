"use client";
// ส่วนประกอบเล็ก ๆ ที่ใช้ร่วมในหน้าข้อมูลอ้างอิง
import Icon from "@/components/Icon";
import { FileSpreadsheet, DownloadCloud, UploadCloud, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import type { DatasetMeta, DatasetSourceKind } from "@/lib/datasets";
import type { MessageKey } from "@/i18n/dictionaries";
import { useT } from "@/i18n/LanguageProvider";

export const SOURCE_ICON: Record<DatasetSourceKind, typeof FileSpreadsheet> = {
  file: FileSpreadsheet,
  api_pull: DownloadCloud,
  api_push: UploadCloud,
};

export const SOURCE_KEY: Record<DatasetSourceKind, MessageKey> = {
  file: "ds.source.file",
  api_pull: "ds.source.apiPull",
  api_push: "ds.source.apiPush",
};

export function fmtTime(s: string | null, lang: string): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "short", timeStyle: "short" });
}

export function SyncBadge({ ds }: { ds: Pick<DatasetMeta, "lastSyncStatus" | "lastSyncedAt" | "lastSyncError"> }) {
  const { t, lang } = useT();
  const base: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".76rem", borderRadius: 999, padding: "2px 9px", border: "1px solid" };
  if (ds.lastSyncStatus === "running")
    return <span style={{ ...base, color: "var(--accent)", borderColor: "var(--accent)" }}><Icon icon={Loader2} className="h-3.5 w-3.5" /> {t("ds.syncing")}</span>;
  if (ds.lastSyncStatus === "error")
    return <span title={ds.lastSyncError} style={{ ...base, color: "var(--fail)", borderColor: "var(--fail)" }}><Icon icon={AlertTriangle} className="h-3.5 w-3.5" /> {t("ds.lastFailed")}</span>;
  if (ds.lastSyncedAt)
    return <span style={{ ...base, color: "var(--pass)", borderColor: "var(--pass)" }}><Icon icon={CheckCircle2} className="h-3.5 w-3.5" /> {fmtTime(ds.lastSyncedAt, lang)}</span>;
  return <span style={{ ...base, color: "var(--ink-3)", borderColor: "var(--line)" }}>{t("common.none")}</span>;
}

export const smallBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 7,
  border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)",
  cursor: "pointer", fontFamily: "inherit", fontSize: ".8rem",
};

export const selectStyle: React.CSSProperties = {
  padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)",
  color: "var(--ink)", fontFamily: "inherit", fontSize: ".88rem",
};

export const label: React.CSSProperties = { display: "block", fontSize: ".8rem", fontWeight: 600, color: "var(--ink-2)", margin: "12px 0 5px" };

export const tableWrap: React.CSSProperties = { overflowX: "auto", border: "1px solid var(--line)", borderRadius: 10, maxWidth: "100%" };
export const th: React.CSSProperties = { textAlign: "left", padding: "7px 10px", fontSize: ".76rem", color: "var(--ink-2)", background: "var(--surface-2)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
export const td: React.CSSProperties = { padding: "6px 10px", fontSize: ".82rem", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" };
