"use client";
import { useMemo, useState } from "react";
import { Card, Field, Pill } from "@/components/ui";
import Icon from "@/components/Icon";
import { ScrollText, Search } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { actionKind, actionLabel, describeAudit } from "@/lib/audit-labels";

export interface AuditRow {
  id: number;
  actor_id: string | null;
  actorName: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  /** ชื่อเป้าหมายจริง (ฟอร์ม/เครื่อง/ชุดข้อมูล/สมาชิก) — ฝั่ง server หาให้ */
  targetName?: string;
  /** ชื่อฟอร์มจาก meta.form_id */
  formName?: string;
}

export default function AuditClient({ rows, roleNames, days }: { rows: AuditRow[]; roleNames: Record<string, string>; days?: number }) {
  const { t, tt, lang } = useT();
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");

  // แปลทุกแถวครั้งเดียว — ใช้ทั้งแสดงผลและค้นหา (ค้นด้วยคำที่ผู้ใช้เห็นได้)
  const view = useMemo(
    () => rows.map((r) => {
      const label = actionLabel(r.action, lang);
      const details = describeAudit(r, lang, { targetName: r.targetName, formName: r.formName, roleNames });
      const hay = `${label} ${r.actorName} ${details.map((d) => `${d.k} ${d.v}`).join(" ")}`.toLowerCase();
      return { r, label, details, hay };
    }),
    [rows, lang, roleNames],
  );

  const actions = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of view) m.set(v.r.action, v.label);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], lang));
  }, [view, lang]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return view.filter((v) => (action === "all" || v.r.action === action) && (!term || v.hay.includes(term)));
  }, [view, q, action]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "th-TH", {
      day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
    });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, minWidth: 0 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={ScrollText} className="h-6 w-6" /> {t("audit.title")}
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("audit.sub")}</p>
        {days != null && <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: "2px 0 0" }}>{tt("audit.retention", { n: days })}</p>}
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
            aria-label={t("audit.action")}
            style={{ padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".9rem", maxWidth: "100%" }}
          >
            <option value="all">{t("audit.allActions")}</option>
            {actions.map(([a, l]) => <option key={a} value={a}>{l}</option>)}
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
                {filtered.map(({ r, label, details }) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--line)", verticalAlign: "top" }}>
                    <td className="tabnum" style={{ padding: "8px", color: "var(--ink-2)", whiteSpace: "nowrap" }}>{fmt(r.created_at)}</td>
                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{r.actorName}</td>
                    <td style={{ padding: "8px" }}><Pill kind={actionKind(r.action)}>{label}</Pill></td>
                    <td style={{ padding: "8px", fontSize: ".82rem", minWidth: 220 }}>
                      {details.length === 0 ? <span style={{ color: "var(--ink-3)" }}>—</span> : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px" }}>
                          {details.map((d, i) => (
                            <span key={i} style={{ overflowWrap: "anywhere" }}>
                              <span style={{ color: "var(--ink-3)" }}>{d.k}: </span>
                              <span style={{ color: d.warn ? "var(--fail)" : "var(--ink)", fontWeight: i === 0 ? 600 : 400 }}>{d.v}</span>
                            </span>
                          ))}
                        </div>
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
