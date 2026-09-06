"use client";
import { useState } from "react";
import { Card, Button, Field } from "@/components/ui";
import Icon from "@/components/Icon";
import { FileSpreadsheet, Download, CalendarDays } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export interface ReportFormOpt { id: string; title: string; icon: string }

type Preset = "7d" | "30d" | "month" | "all" | "custom";

function ymd(d: Date) { return d.toLocaleDateString("sv"); } // YYYY-MM-DD (local)

export default function ReportsClient({ forms }: { forms: ReportFormOpt[] }) {
  const { t, lang } = useT();
  const en = lang === "en";
  const [formId, setFormId] = useState("all");
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [result, setResult] = useState("all");
  const [approval, setApproval] = useState("all");

  // แปลง preset → from/to
  function resolveDates(): { from?: string; to?: string } {
    const now = new Date();
    if (preset === "custom") return { from: from || undefined, to: to || undefined };
    if (preset === "all") return {};
    if (preset === "month") return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
    const days = preset === "7d" ? 7 : 30;
    return { from: ymd(new Date(now.getTime() - days * 864e5)), to: ymd(now) };
  }

  function exportXlsx() {
    const p = new URLSearchParams();
    if (formId !== "all") p.set("form_id", formId);
    const d = resolveDates();
    if (d.from) p.set("from", d.from);
    if (d.to) p.set("to", d.to);
    if (result !== "all") p.set("result", result);
    if (approval !== "all") p.set("approval", approval);
    // นำทางไป endpoint → เบราว์เซอร์ดาวน์โหลดไฟล์ .xlsx
    window.location.href = `/api/report?${p.toString()}`;
  }

  const presets: { k: Preset; label: string }[] = [
    { k: "7d", label: en ? "7 days" : "7 วัน" },
    { k: "30d", label: en ? "30 days" : "30 วัน" },
    { k: "month", label: en ? "This month" : "เดือนนี้" },
    { k: "all", label: en ? "All time" : "ทั้งหมด" },
    { k: "custom", label: en ? "Custom" : "กำหนดเอง" },
  ];
  const results = [
    { k: "all", label: en ? "All" : "ทั้งหมด" },
    { k: "pass", label: en ? "Pass" : "ผ่าน" },
    { k: "fail", label: en ? "Fail" : "ไม่ผ่าน" },
  ];
  const approvals = [
    { k: "all", label: en ? "All" : "ทั้งหมด" },
    { k: "pending", label: en ? "Pending" : "รออนุมัติ" },
    { k: "approved", label: en ? "Approved" : "อนุมัติแล้ว" },
    { k: "rejected", label: en ? "Rejected" : "ตีกลับ" },
    { k: "none", label: en ? "No approval" : "ไม่มีอนุมัติ" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16, minWidth: 0 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon icon={FileSpreadsheet} className="h-5 w-5" /> {t("report.title")}
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", margin: 0 }}>{t("report.subtitle")}</p>
      </div>

      <Card>
        {/* ฟอร์ม */}
        <label style={labelStyle}>{t("report.form")}</label>
        <select value={formId} onChange={(e) => setFormId(e.target.value)} style={selStyle}>
          <option value="all">{t("report.allForms")}</option>
          {forms.map((f) => <option key={f.id} value={f.id}>{f.icon} {f.title}</option>)}
        </select>

        {/* ช่วงเวลา */}
        <label style={{ ...labelStyle, marginTop: 16 }}>{t("report.range")}</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {presets.map((p) => (
            <button key={p.k} onClick={() => setPreset(p.k)} style={chip(preset === p.k)}>{p.label}</button>
          ))}
        </div>
        {preset === "custom" && (
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <span style={{ fontSize: ".78rem", color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon icon={CalendarDays} className="h-3.5 w-3.5" /> {t("report.from")}</span>
              <Field type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <span style={{ fontSize: ".78rem", color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon icon={CalendarDays} className="h-3.5 w-3.5" /> {t("report.to")}</span>
              <Field type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        )}

        {/* ผลลัพธ์ */}
        <label style={{ ...labelStyle, marginTop: 16 }}>{t("report.result")}</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {results.map((r) => (
            <button key={r.k} onClick={() => setResult(r.k)} style={chip(result === r.k)}>{r.label}</button>
          ))}
        </div>

        {/* สถานะอนุมัติ */}
        <label style={{ ...labelStyle, marginTop: 16 }}>{t("report.approval")}</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {approvals.map((a) => (
            <button key={a.k} onClick={() => setApproval(a.k)} style={chip(approval === a.k)}>{a.label}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20, alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="primary" onClick={exportXlsx}>
            <Icon icon={Download} className="h-4 w-4" /> {t("report.exportXlsx")}
          </Button>
          <span style={{ color: "var(--ink-3)", fontSize: ".8rem" }}>{t("report.hint")}</span>
        </div>
      </Card>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontWeight: 600, fontSize: ".88rem", display: "block", marginBottom: 8 };
const selStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", borderRadius: 10, fontFamily: "inherit", fontSize: ".9rem",
  border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)",
};
function chip(on: boolean): React.CSSProperties {
  return {
    padding: "7px 13px", borderRadius: 20, fontSize: ".84rem", cursor: "pointer", fontFamily: "inherit",
    border: on ? "1px solid var(--accent)" : "1px solid var(--line)",
    background: on ? "var(--accent-soft)" : "var(--surface)",
    color: on ? "var(--accent)" : "var(--ink-2)", fontWeight: on ? 600 : 500,
  };
}
