"use client";
import { InlineFormIcon } from "@/components/FormIcon";
import { useState } from "react";
import { Card, Button, Field, Notice, Pill } from "@/components/ui";
import Icon from "@/components/Icon";
import { FileSpreadsheet, Download, Search, CalendarDays } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { previewReport, type PreviewRow } from "./actions";

export interface ReportFormOpt { id: string; title: string; icon: string }

type Preset = "7d" | "30d" | "month" | "all" | "custom";

function ymd(d: Date) { return d.toLocaleDateString("sv"); }

export default function ReportsClient({ forms }: { forms: ReportFormOpt[] }) {
  const { t, tt, lang } = useT();
  const fmtWhen = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });
  };
  const [formId, setFormId] = useState("all");
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [result, setResult] = useState("all");
  const [approval, setApproval] = useState("all");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; total: number } | null>(null);

  function resolveDates(): { from?: string; to?: string } {
    const now = new Date();
    if (preset === "custom") return { from: from || undefined, to: to || undefined };
    if (preset === "all") return {};
    if (preset === "month") return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
    const days = preset === "7d" ? 7 : 30;
    return { from: ymd(new Date(now.getTime() - days * 864e5)), to: ymd(now) };
  }
  function filters() {
    const d = resolveDates();
    return { formId, from: d.from, to: d.to, result, approval };
  }

  async function search() {
    setBusy(true); setMsg(null);
    const res = await previewReport(filters());
    setBusy(false);
    if ("error" in res) { setMsg({ t: res.error, err: true }); setPreview(null); return; }
    setPreview(res);
  }

  function exportXlsx() {
    const p = new URLSearchParams();
    const f = filters();
    if (f.formId !== "all") p.set("form_id", f.formId);
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    if (f.result !== "all") p.set("result", f.result);
    if (f.approval !== "all") p.set("approval", f.approval);
    // ดาวน์โหลดไฟล์ (ไม่ใช่การเปลี่ยนหน้า) — คลิกลิงก์ชั่วคราว หน้าปัจจุบันยังอยู่
    const a = document.createElement("a");
    a.href = `/api/report?${p.toString()}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const approvalLabel = (a: string) =>
    a === "pending" ? t("dash.pending")
      : a === "approved" ? t("dash.approved")
      : a === "rejected" ? t("dash.rejected")
      : "-";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16, minWidth: 0 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={FileSpreadsheet} className="h-5 w-5" /> {t("report.title")}
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("report.subtitle")}</p>
      </div>

      <Card>
        {/* แถวตัวกรอง — dropdown เรียงแถวเดียว (ตัดบรรทัดบนจอแคบ) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <Selectable label={t("report.form")}>
            <select value={formId} onChange={(e) => setFormId(e.target.value)} style={selStyle}>
              <option value="all">{t("report.allForms")}</option>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </Selectable>

          <Selectable label={t("report.range")}>
            <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} style={selStyle}>
              <option value="7d">{t("rep.7d")}</option>
              <option value="30d">{t("rep.30d")}</option>
              <option value="month">{t("rep.thisMonth")}</option>
              <option value="all">{t("rep.allTime")}</option>
              <option value="custom">{t("rep.custom")}</option>
            </select>
          </Selectable>

          <Selectable label={t("report.result")}>
            <select value={result} onChange={(e) => setResult(e.target.value)} style={selStyle}>
              <option value="all">{t("studio.stAll")}</option>
              <option value="pass">{t("rep.pass")}</option>
              <option value="fail">{t("rep.fail")}</option>
            </select>
          </Selectable>

          <Selectable label={t("report.approval")}>
            <select value={approval} onChange={(e) => setApproval(e.target.value)} style={selStyle}>
              <option value="all">{t("studio.stAll")}</option>
              <option value="pending">{t("dash.pending")}</option>
              <option value="approved">{t("dash.approved")}</option>
              <option value="rejected">{t("dash.rejected")}</option>
              <option value="none">{t("rep.noApproval")}</option>
            </select>
          </Selectable>
        </div>

        {preset === "custom" && (
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <span style={dateLabel}><Icon icon={CalendarDays} className="h-3.5 w-3.5" /> {t("report.from")}</span>
              <Field type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <span style={dateLabel}><Icon icon={CalendarDays} className="h-3.5 w-3.5" /> {t("report.to")}</span>
              <Field type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
          <Button onClick={search} disabled={busy}>
            <Icon icon={Search} className="h-4 w-4" /> {busy ? t("rep.searching") : t("report.search")}
          </Button>
          <Button data-tour="report-export" variant="primary" onClick={exportXlsx} disabled={!preview || preview.total === 0}>
            <Icon icon={Download} className="h-4 w-4" /> {t("report.exportXlsx")}
          </Button>
          <span style={{ color: "var(--ink-3)", fontSize: ".78rem", flexBasis: "100%" }}>
            {formId === "all"
              ? t("rep.hintPickForm")
              : t("rep.hintOneForm")}
          </span>
          {preview && (
            <span style={{ color: "var(--ink-2)", fontSize: ".85rem" }}>
              {tt("rep.found", { n: preview.total.toLocaleString() })}
              {preview.total > preview.rows.length && tt("rep.showingFirst", { n: preview.rows.length })}
            </span>
          )}
        </div>
        {msg && <Notice kind={msg.err ? "error" : "info"}>{msg.t}</Notice>}
      </Card>

      {/* ตาราง preview */}
      {preview && (
        preview.rows.length === 0 ? (
          <Card><p style={{ color: "var(--ink-3)", margin: 0 }}>{t("rep.noData")}</p></Card>
        ) : (
          <Card>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem", minWidth: 620 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--ink-3)", borderBottom: "1px solid var(--line)" }}>
                    <th style={th}>{t("rep.colSubmitted")}</th>
                    <th style={th}>{t("report.form")}</th>
                    <th style={th}>{t("rep.colBy")}</th>
                    <th style={th}>{t("report.result")}</th>
                    <th style={th}>{t("rep.colApproval")}</th>
                    <th style={{ ...th, textAlign: "right" }}>{t("rep.colIssues")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={td}>{fmtWhen(r.when)}</td>
                      <td style={td}><InlineFormIcon value={r.icon} size={15} />{r.form}</td>
                      <td style={td}>{r.user}</td>
                      <td style={td}>
                        {r.result === "fail"
                          ? <Pill kind="fail">{t("rep.fail")}</Pill>
                          : <Pill kind="pass">{t("rep.pass")}</Pill>}
                      </td>
                      <td style={td}>{r.approval === "none" ? "-" : approvalLabel(r.approval)}</td>
                      <td style={{ ...td, textAlign: "right", color: r.failCount ? "var(--fail)" : "var(--ink-3)" }}>{r.failCount || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "10px 0 0" }}>{t("report.hint")}</p>
          </Card>
        )
      )}
    </div>
  );
}

function Selectable({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // ป้ายครอบช่องเลือก → โปรแกรมอ่านหน้าจออ่านชื่อช่องได้
    <label style={{ display: "block" }}>
      <span style={{ fontWeight: 600, fontSize: ".82rem", display: "block", marginBottom: 5, color: "var(--ink-2)" }}>{label}</span>
      {children}
    </label>
  );
}

const selStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", borderRadius: 10, fontFamily: "inherit", fontSize: ".88rem",
  border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)",
};
const dateLabel: React.CSSProperties = { fontSize: ".78rem", color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 3 };
const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", verticalAlign: "top" };
