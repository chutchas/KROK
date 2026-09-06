"use client";
import { useMemo, useState } from "react";
import { Card, Field, Pill } from "@/components/ui";
import Icon from "@/components/Icon";
import { ScrollText, Search } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export interface AuditRow {
  id: number;
  actor_id: string | null;
  actorName: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

// หมวดของ action → สีป้าย
function kindOf(action: string): "pass" | "fail" | "na" {
  if (action.includes("delete") || action.includes("archive") || action.includes("cancel")) return "fail";
  if (action.includes("create") || action.includes("publish") || action.includes("approve")) return "pass";
  return "na";
}

export default function AuditClient({ rows, tenantName }: { rows: AuditRow[]; tenantName: string }) {
  const { t, lang } = useT();
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");

  const actions = useMemo(() => Array.from(new Set(rows.map((r) => r.action))).sort(), [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (action !== "all" && r.action !== action) return false;
      if (!term) return true;
      return (
        r.action.toLowerCase().includes(term) ||
        r.actorName.toLowerCase().includes(term) ||
        (r.target_type || "").toLowerCase().includes(term) ||
        JSON.stringify(r.meta).toLowerCase().includes(term)
      );
    });
  }, [rows, q, action]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "th-TH", {
      day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
    });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, minWidth: 0 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={ScrollText} className="h-6 w-6" /> {t("audit.title")}
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{tenantName} · {t("audit.sub")}</p>
      </div>

      <Card>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }}>
              <Icon icon={Search} className="h-4 w-4" />
            </span>
            <Field value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("audit.search")} style={{ width: "100%", paddingLeft: 32 }} />
          </div>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            style={{ padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem" }}
          >
            <option value="all">{t("audit.allActions")}</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: "0 0 8px" }}>
          {filtered.length} / {rows.length} {t("audit.entries")}
        </p>

        {filtered.length === 0 ? (
          <p style={{ color: "var(--ink-3)", textAlign: "center", padding: "24px 0" }}>{t("audit.empty")}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".86rem" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--ink-3)", fontSize: ".76rem" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>{t("audit.time")}</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>{t("audit.actor")}</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>{t("audit.action")}</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>{t("audit.target")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="tabnum" style={{ padding: "8px", color: "var(--ink-2)", whiteSpace: "nowrap" }}>{fmt(r.created_at)}</td>
                    <td style={{ padding: "8px" }}>{r.actorName}</td>
                    <td style={{ padding: "8px" }}><Pill kind={kindOf(r.action)}>{r.action}</Pill></td>
                    <td style={{ padding: "8px", color: "var(--ink-3)", fontSize: ".78rem" }}>
                      {r.target_type || "—"}
                      {r.meta && Object.keys(r.meta).length > 0 && (
                        <code style={{ display: "block", fontSize: ".7rem", color: "var(--ink-3)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {JSON.stringify(r.meta)}
                        </code>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
