"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import FormIcon from "@/components/FormIcon";
import Icon from "@/components/Icon";
import { Card } from "@/components/ui";
import { CalendarCheck2, Tag, ChevronDown } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { loadScheduleCompliance, type ComplianceResult } from "./actions";

/**
 * ความครบถ้วนของรอบตรวจตามตาราง (โหลดแยกหลังหน้าแสดงแล้ว — ไม่ถ่วงแดชบอร์ด)
 * ไม่มีฟอร์มที่ตั้งตาราง = ไม่แสดงการ์ด
 */
export default function ComplianceCard() {
  const { t, tt } = useT();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<ComplianceResult | null | undefined>(undefined);
  const [view, setView] = useState<"forms" | "teams">("forms");
  const [openId, setOpenId] = useState<string | null>(null);

  const first = useRef(true);
  useEffect(() => {
    let alive = true;
    // ครั้งแรก: หน่วงไว้ให้ widget อื่นโหลดก่อน (server action ของ client เดียวกันวิ่งทีละรายการ)
    const delay = first.current ? 1200 : 0;
    first.current = false;
    const tm = setTimeout(() => {
    loadScheduleCompliance(days).then((r) => { if (alive) setData(r && "error" in r ? null : r); }).catch(() => { if (alive) setData(null); });
    }, delay);
    return () => { alive = false; clearTimeout(tm); };
  }, [days]);

  if (!data || !data.forms.length) return null;

  const total = data.forms.reduce((a, r) => ({ due: a.due + r.due, onTime: a.onTime + r.onTime, late: a.late + r.late, missed: a.missed + r.missed }), { due: 0, onTime: 0, late: 0, missed: 0 });
  const rate = total.due ? Math.round((total.onTime / total.due) * 1000) / 10 : null;
  const color = (r: number | null) => (r == null ? "var(--ink-3)" : r >= 90 ? "var(--pass)" : r >= 70 ? "var(--warn)" : "var(--fail)");
  const bar = (r: { due: number; onTime: number; late: number; missed: number }) => {
    const w = (n: number) => `${r.due ? (n / r.due) * 100 : 0}%`;
    return (
      <div style={{ display: "flex", height: 7, borderRadius: 6, overflow: "hidden", background: "var(--surface-2)", marginTop: 5 }} aria-hidden>
        <div style={{ width: w(r.onTime), background: "var(--pass)" }} />
        <div style={{ width: w(r.late), background: "var(--warn)" }} />
        <div style={{ width: w(r.missed), background: "var(--fail)" }} />
      </div>
    );
  };
  const counts = (r: { due: number; onTime: number; late: number; missed: number }) =>
    tt("comp.counts", { on: r.onTime, late: r.late, missed: r.missed, due: r.due });
  const tab = (k: "forms" | "teams", label: string) => (
    <button type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
      style={{ padding: "6px 12px", minHeight: 34, borderRadius: 20, border: `1px solid ${view === k ? "var(--accent)" : "var(--line)"}`, background: view === k ? "var(--accent-soft)" : "var(--surface)", color: view === k ? "var(--accent-text)" : "var(--ink-2)", fontFamily: "inherit", fontSize: ".82rem", cursor: "pointer", fontWeight: view === k ? 600 : 500 }}>
      {label}
    </button>
  );

  return (
    <Card style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: "1.1rem", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon icon={CalendarCheck2} className="h-5 w-5" /> {t("comp.title")}
        </h2>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label={t("comp.range")}
            style={{ padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: ".85rem", minHeight: 36 }}>
            <option value={7}>{t("comp.d7")}</option>
            <option value={30}>{t("comp.d30")}</option>
            <option value={90}>{t("comp.d90")}</option>
          </select>
          <Link href="/forms?tab=today" style={{ fontSize: ".84rem", color: "var(--accent-text)", whiteSpace: "nowrap" }}>{t("comp.todayLink")}</Link>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "10px 0 2px", flexWrap: "wrap" }}>
        <span className="tabnum" style={{ fontSize: "2rem", fontWeight: 700, fontFamily: "var(--font-anuphan)", color: color(rate) }}>{rate == null ? "—" : `${rate}%`}</span>
        <span style={{ color: "var(--ink-2)", fontSize: ".85rem" }}>{t("comp.onTimeRate")}</span>
      </div>
      <small style={{ color: "var(--ink-3)", fontSize: ".78rem" }}>{counts(total)}</small>
      {bar(total)}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: ".74rem", color: "var(--ink-3)", marginTop: 6 }}>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "var(--pass)", marginRight: 4 }} />{t("comp.onTime")}</span>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "var(--warn)", marginRight: 4 }} />{t("comp.late")}</span>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "var(--fail)", marginRight: 4 }} />{t("comp.missed")}</span>
      </div>

      {data.teams.length > 0 && (
        <div role="tablist" style={{ display: "flex", gap: 6, margin: "14px 0 4px" }}>
          {tab("forms", t("comp.byForm"))}
          {tab("teams", t("comp.byTeam"))}
        </div>
      )}

      <div style={{ display: "grid", gap: 2, marginTop: 8 }}>
        {view === "teams"
          ? data.teams.map((r) => (
            <div key={r.teamId} style={{ padding: "10px 2px", borderTop: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon icon={Tag} className="h-4 w-4" />
                <b style={{ flex: 1, fontSize: ".9rem" }}>{r.name}</b>
                <small style={{ color: "var(--ink-3)", fontSize: ".74rem" }}>{tt("comp.formsN", { n: r.forms })}</small>
                <b className="tabnum" style={{ color: color(r.rate), fontSize: ".95rem" }}>{r.rate == null ? "—" : `${r.rate}%`}</b>
              </div>
              {bar(r)}
              <small style={{ color: "var(--ink-3)", fontSize: ".74rem" }}>{counts(r)}</small>
            </div>
          ))
          : data.forms.map((r) => {
            const expandable = !!r.people?.length;
            const open = openId === r.formId;
            return (
              <div key={r.formId} style={{ padding: "10px 2px", borderTop: "1px solid var(--line)" }}>
                <button type="button" onClick={() => expandable && setOpenId(open ? null : r.formId)} aria-expanded={expandable ? open : undefined}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", border: "none", background: "none", padding: 0, cursor: expandable ? "pointer" : "default", color: "inherit", fontFamily: "inherit", textAlign: "left" }}>
                  <FormIcon value={r.icon} size={28} />
                  <b style={{ flex: 1, minWidth: 0, fontSize: ".9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</b>
                  {r.mode === "each" && <small style={{ color: "var(--ink-3)", fontSize: ".72rem" }}>{t("comp.each")}</small>}
                  <b className="tabnum" style={{ color: color(r.rate), fontSize: ".95rem" }}>{r.rate == null ? "—" : `${r.rate}%`}</b>
                  {expandable && <span style={{ display: "inline-flex", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", color: "var(--ink-3)" }}><Icon icon={ChevronDown} className="h-4 w-4" /></span>}
                </button>
                {bar(r)}
                <small style={{ color: "var(--ink-3)", fontSize: ".74rem" }}>{counts(r)}{r.pending > 0 && ` · ${tt("comp.pending", { n: r.pending })}`}</small>
                {open && r.people && (
                  <div style={{ display: "grid", gap: 4, margin: "8px 0 0 36px" }}>
                    {r.people.map((p, i) => {
                      const pr = p.due ? Math.round((p.onTime / p.due) * 100) : null;
                      return (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: ".82rem", alignItems: "center" }}>
                          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                          <small style={{ color: "var(--ink-3)", fontSize: ".72rem" }}>{tt("comp.personCounts", { on: p.onTime, late: p.late, missed: p.missed })}</small>
                          <b className="tabnum" style={{ color: color(pr), minWidth: 44, textAlign: "right" }}>{pr == null ? "—" : `${pr}%`}</b>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </Card>
  );
}
