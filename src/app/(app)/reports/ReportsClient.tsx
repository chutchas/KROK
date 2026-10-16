"use client";
import { InlineFormIcon } from "@/components/FormIcon";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, EmptyState, Field, Notice, Pill } from "@/components/ui";
import Icon from "@/components/Icon";
import { Download, FileText, Search, CalendarDays, Trash2, ChevronRight } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";
import { previewReport, type PreviewRow } from "./actions";
import PageHeader from "@/components/PageHeader";

export interface ReportFormOpt { id: string; title: string; icon: string }

// ช่วงเวลาชุดเดียวกับแดชบอร์ด (วันนี้/7/14/30 วัน นับรวมวันนี้) + เดือนนี้/ทั้งหมด/กำหนดเอง
type Preset = "today" | "7d" | "14d" | "30d" | "month" | "all" | "custom";
const PRESET_DAYS: Partial<Record<Preset, number>> = { today: 1, "7d": 7, "14d": 14, "30d": 30 };
function presetDates(p: Preset, from: string, to: string): { from?: string; to?: string } {
  const now = new Date();
  if (p === "custom") return { from: from || undefined, to: to || undefined };
  if (p === "all") return {};
  if (p === "month") return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
  const days = PRESET_DAYS[p] ?? 30;
  const start = new Date(now); start.setDate(now.getDate() - (days - 1));
  return { from: ymd(start), to: ymd(now) };
}

function ymd(d: Date) { return d.toLocaleDateString("sv"); }

export default function ReportsClient({ forms, mine = false, canTrash = false, initialResult = null }: { forms: ReportFormOpt[]; mine?: boolean; canTrash?: boolean; initialResult?: string | null }) {
  const { t, tt, lang } = useT();
  const router = useRouter();
  const [more, setMore] = useState(false);
  const fmtWhen = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
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

  const resolveDates = () => presetDates(preset, from, to);
  function filters() {
    const d = resolveDates();
    return { formId, from: d.from, to: d.to, result, approval };
  }

  // จำตัวกรองล่าสุดในแท็บนี้ — กดดูเอกสารแล้วกลับมา ได้ผลการค้นหาเดิม (ค้นใหม่ให้ข้อมูลล่าสุด)
  const KEY = "krok_report_filters_v1";
  function filtersOf(v: { formId: string; preset: Preset; from: string; to: string; result: string; approval: string }) {
    const d = presetDates(v.preset, v.from, v.to);
    return { formId: v.formId, from: d.from, to: d.to, result: v.result, approval: v.approval };
  }

  async function search() {
    setSavedSnap(null);
    try { sessionStorage.setItem(KEY, JSON.stringify({ formId, preset, from, to, result, approval })); } catch { /* ไม่มี storage = ไม่จำ */ }
    await runSearch(filters());
  }

  // ตัวกรองของผลที่แสดงอยู่ — ผล "ไม่พบ" ใช้ปิดปุ่มส่งออกได้เฉพาะเมื่อตัวกรองยังเหมือนเดิม
  const [previewKey, setPreviewKey] = useState("");
  async function runSearch(f: ReturnType<typeof filters>) {
    setBusy(true); setMsg(null);
    const res = await previewReport(f);
    setBusy(false);
    if ("error" in res) { setMsg({ t: res.error, err: true }); setPreview(null); return; }
    setPreview(res);
    setPreviewKey(JSON.stringify(f));
  }

  const restored = useRef(false);
  // คืนตัวกรองที่จำไว้ (sessionStorage) → บอกผู้ใช้ + ปุ่มล้าง (ไม่งั้นกลับมาเจอ "ไม่พบ" แล้วไม่รู้ว่าเพราะตัวกรองเดิม)
  // ค่าตัวกรองตอนคืนจาก storage — ป้ายแสดงเฉพาะเมื่อค่าที่จำไว้ ≠ ค่าเริ่มต้น และผู้ใช้ยังไม่ได้เปลี่ยนเอง
  const [savedSnap, setSavedSnap] = useState<string | null>(null);
  const firstFilterRef = useRef<HTMLSelectElement>(null);
  const snapOf = (v: { formId: string; preset: string; from: string; to: string; result: string; approval: string }) => JSON.stringify([v.formId, v.preset, v.from, v.to, v.result, v.approval]);
  const DEFAULT_SNAP = snapOf({ formId: "all", preset: "30d", from: "", to: "", result: "all", approval: "all" });
  const curSnap = snapOf({ formId, preset, from, to, result, approval });
  const usingSaved = savedSnap !== null && savedSnap !== DEFAULT_SNAP && curSnap === savedSnap;
  function resetFilters() {
    try { sessionStorage.removeItem(KEY); } catch { /* ไม่มี storage */ }
    setFormId("all"); setPreset("30d"); setFrom(""); setTo(""); setResult("all"); setApproval("all");
    setSavedSnap(null); setPreview(null); setPreviewKey(""); setMsg(null);
    // ปุ่มล้างหายไปพร้อมป้าย → ย้ายโฟกัสไปช่องตัวกรองแรก (ไม่หลุดไป <body>)
    requestAnimationFrame(() => firstFilterRef.current?.focus());
  }
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    let saved: { formId?: string; preset?: Preset; from?: string; to?: string; result?: string; approval?: string } | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { saved = null; }
    // ลิงก์จากแดชบอร์ด (?result=fail_open) → ไม่ผ่าน·ยังไม่ปิดเรื่อง 30 วัน (ช่วงเดียวกับแถบ "ต้องดูตอนนี้") แทนตัวกรองที่จำไว้
    if (initialResult) saved = { formId: "all", preset: "30d", result: initialResult, approval: "all" };
    if (!saved) return;
    const f = { formId: saved.formId && (saved.formId === "all" || forms.some((x) => x.id === saved!.formId)) ? saved.formId : "all", preset: saved.preset || "30d", from: saved.from || "", to: saved.to || "", result: saved.result || "all", approval: saved.approval || "all" };
    /* eslint-disable react-hooks/set-state-in-effect -- คืนค่าจาก sessionStorage ได้หลัง mount เท่านั้น */
    setFormId(f.formId); setPreset(f.preset); setFrom(f.from); setTo(f.to); setResult(f.result); setApproval(f.approval);
    if (!initialResult) setSavedSnap(snapOf(f));
    /* eslint-enable react-hooks/set-state-in-effect */
    void runSearch(filtersOf(f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // แสดงแถวถัดไป (ทีละ 100)
  async function loadMore() {
    if (!preview) return;
    setMore(true);
    const res = await previewReport(filters(), preview.rows.length);
    setMore(false);
    if ("error" in res) { setMsg({ t: res.error, err: true }); return; }
    setPreview({ rows: [...preview.rows, ...res.rows], total: res.total });
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

  // ช่วง "กำหนดเอง" ต้องมีวันที่ครบทั้งสองช่อง — ไม่งั้นค้น/ส่งออกไม่ได้ (กันจำตัวกรองว่าง "… – …")
  const needDates = preset === "custom" && (!from || !to);
  const emptyNow = preview?.total === 0 && previewKey === JSON.stringify(filters());
  // ตัวกรองเปลี่ยนหลังค้นครั้งล่าสุด → ผลที่แสดงเป็นของตัวกรองเดิม (จางลง + บอกให้กดค้นหา)
  const stale = !!preview && previewKey !== "" && previewKey !== JSON.stringify(filters());
  const presetLabel: Record<Preset, string> = { today: t("rep.today"), "7d": t("rep.7d"), "14d": t("rep.14d"), "30d": t("rep.30d"), month: t("rep.thisMonth"), all: t("rep.allTime"), custom: t("rep.custom") };
  const resultLabel: Record<string, string> = { pass: t("rep.pass"), fail: t("rep.fail"), fail_open: t("rep.failOpen"), fail_closed: t("rep.failClosed") };
  const approvalLabel = (a: string) =>
    a === "pending" ? t("dash.pending")
      : a === "approved" ? t("dash.approved")
      : a === "rejected" ? t("dash.rejected")
      : "-";
  // "ชื่อช่อง: ค่า" — บอกให้รู้ว่าค่าไหนเป็นของตัวกรองอะไร · กำหนดเอง = แสดงวันที่
  const fmtDay = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium" }) : "…");
  const savedSummary = [
    formId !== "all" ? `${t("report.form")}: ${forms.find((f) => f.id === formId)?.title ?? ""}` : null,
    preset !== "30d" ? `${t("report.range")}: ${preset === "custom" ? `${fmtDay(from)} – ${fmtDay(to)}` : presetLabel[preset]}` : null,
    result !== "all" ? `${t("report.result")}: ${resultLabel[result]}` : null,
    approval !== "all" ? `${t("report.approval")}: ${approval === "none" ? t("rep.noApproval") : approvalLabel(approval)}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16, minWidth: 0 }}>
      <PageHeader title={mine ? t("rep.mineTitle") : t("report.title")} help="export-excel" subtitle={mine ? t("rep.mineSub") : t("report.subtitle")}
        actions={canTrash ? (
          <a href="/reports/trash" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, fontSize: ".86rem" }}>
            <Icon icon={Trash2} className="h-4 w-4" /> {t("trash.title")}
          </a>
        ) : undefined} />

      {forms.length === 0 ? (
        // ยังไม่มีฟอร์ม = ยังไม่มีอะไรให้ค้น/ส่งออก — ไม่โชว์ตัวกรองกับปุ่ม Excel
        <Card>
          <EmptyState icon={<Icon icon={FileText} className="h-7 w-7" />} title={t("rep.emptyTitle")} hint={mine ? t("rep.emptyMine") : t("rep.emptyBody")}
            action={mine ? undefined : { href: "/studio", label: t("appr.goStudio") }} />
        </Card>
      ) : (<>
      <Card>
        {usingSaved && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "-4px 0 10px", fontSize: ".82rem", color: "var(--ink-2)" }}>
            <span style={{ padding: "2px 10px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent-text)", fontWeight: 600 }}>{t("rep.restored")}{savedSummary ? `: ${savedSummary}` : ""}</span>
            <button type="button" onClick={resetFilters} style={{ minHeight: 44, padding: "0 8px", border: "none", background: "none", color: "var(--accent-text)", textDecoration: "underline", fontFamily: "inherit", fontSize: ".82rem", cursor: "pointer" }}>{t("rep.resetFilters")}</button>
          </div>
        )}
        {/* แถวตัวกรอง — dropdown เรียงแถวเดียว (ตัดบรรทัดบนจอแคบ) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <Selectable label={t("report.form")}>
            <select ref={firstFilterRef} value={formId} onChange={(e) => setFormId(e.target.value)} style={selStyle}>
              <option value="all">{t("report.allForms")}</option>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </Selectable>

          <Selectable label={t("report.range")}>
            <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} style={selStyle}>
              <option value="today">{t("rep.today")}</option>
              <option value="7d">{t("rep.7d")}</option>
              <option value="14d">{t("rep.14d")}</option>
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
              <option value="fail_open">{t("rep.failOpen")}</option>
              <option value="fail_closed">{t("rep.failClosed")}</option>
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
              <label htmlFor="rep-from" style={dateLabel}><Icon icon={CalendarDays} className="h-3.5 w-3.5" /> {t("report.from")}</label>
              <Field id="rep-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="rep-to" style={dateLabel}><Icon icon={CalendarDays} className="h-3.5 w-3.5" /> {t("report.to")}</label>
              <Field id="rep-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            {needDates && <p id="rep-dates-need" style={{ flexBasis: "100%", margin: 0, fontSize: ".82rem", color: "var(--warn-text)", fontWeight: 600 }}>{t("rep.needDates")}</p>}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
          <Button onClick={search} disabled={busy || needDates} aria-describedby={needDates ? "rep-dates-need" : undefined}>
            <Icon icon={Search} className="h-4 w-4" /> {busy ? t("rep.searching") : t("report.search")}
          </Button>
          {/* ส่งออกได้เลยตามตัวกรอง (ไม่ต้องกดค้นหาก่อน) · ปิดเฉพาะเมื่อค้นแล้วไม่พบรายการ — บอกเหตุผลข้างปุ่ม */}
          <Button data-tour="report-export" variant="primary" onClick={exportXlsx} disabled={busy || emptyNow || needDates} aria-describedby={needDates ? "rep-dates-need" : emptyNow ? "rep-nodata" : undefined}>
            <Icon icon={Download} className="h-4 w-4" /> {t("report.exportXlsx")}
          </Button>
          <span style={{ color: "var(--ink-3)", fontSize: ".78rem", flexBasis: "100%" }}>
            {formId === "all"
              ? t("rep.hintPickForm")
              : t("rep.hintOneForm")}
          </span>
          {/* ไม่พบ = บอกที่เดียว (การ์ดผลด้านล่าง) ไม่ซ้ำสามจุด */}
          {/* พื้นที่ประกาศอยู่ตลอด (ไม่สร้างใหม่) — โปรแกรมอ่านหน้าจออ่านทุกครั้งที่ข้อความเปลี่ยน */}
          <span role="status" aria-live="polite" style={{ color: "var(--warn-text)", fontSize: ".85rem", fontWeight: 600 }}>{stale ? t("rep.stale") : ""}</span>
          {/* ประกาศจำนวนผลผ่านพื้นที่ที่มีอยู่ตลอด (ข้อความที่เห็นด้านข้างไม่ต้องอ่านซ้ำ) */}
          <span className="sr-only" aria-live="polite">{preview && !stale && !busy ? tt("rep.found", { n: preview.total.toLocaleString() }) : ""}</span>
          {preview && preview.total > 0 && !stale && (
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
        <div style={{ opacity: stale ? 0.5 : 1, transition: "opacity .15s" }} inert={stale || undefined}>{
        preview.rows.length === 0 ? (
          <Card><p id="rep-nodata" role="status" style={{ color: "var(--ink-2)", margin: 0 }}>{t("rep.exportNone")}</p></Card>
        ) : (
          <Card>
            {/* มือถือ: การ์ดแถวละใบ (ตารางกว้างเกินจอ คอลัมน์ผลลัพธ์อยู่นอกจอ) · จอกว้าง: ตาราง */}
            <ul className="krok-rep-cards" aria-label={t("rep.tableLabel")} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {preview.rows.map((r) => (
                <li key={r.id}>
                  <a href={`/submission/${r.id}?from=reports`} style={{ display: "grid", gap: 4, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", color: "var(--ink)", textDecoration: "none" }}>
                    <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: ".95rem", minWidth: 0 }}><InlineFormIcon value={r.icon} size={15} />{r.form}</span>
                      <span style={{ flex: "0 0 auto" }}>
                        {r.result === "fail"
                          ? r.closed ? <Pill kind="na">{t("rep.failClosedShort")}</Pill> : <Pill kind="fail">{t("rep.fail")}</Pill>
                          : <Pill kind="pass">{t("rep.pass")}</Pill>}
                      </span>
                    </span>
                    <span style={{ fontSize: ".84rem", color: "var(--ink-2)" }}>{fmtWhen(r.when)} · {r.user}</span>
                    {(r.approval !== "none" || r.failCount > 0) && (
                      <span style={{ fontSize: ".82rem", color: "var(--ink-3)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {r.approval !== "none" && <span>{t("rep.colApproval")}: {approvalLabel(r.approval)}</span>}
                        {r.failCount > 0 && <span style={{ color: r.closed ? "var(--ink-3)" : "var(--fail-text)" }}>{t("rep.colIssues")}: {r.failCount}</span>}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
            <div className="krok-rep-table" role="region" aria-label={t("rep.tableLabel")} tabIndex={0} style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem", minWidth: 620 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--ink-3)", borderBottom: "1px solid var(--line)" }}>
                    <th style={th}>{t("rep.colSubmitted")}</th>
                    <th style={th}>{t("report.form")}</th>
                    <th style={th}>{t("rep.colBy")}</th>
                    <th style={th}>{t("report.result")}</th>
                    <th style={th}>{t("rep.colApproval")}</th>
                    <th style={{ ...th, textAlign: "right" }}>{t("rep.colIssues")}</th>
                    <th style={{ ...th, width: 28 }} aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    // ทั้งแถวกดเปิดเอกสารได้ · ลิงก์ที่ชื่อฟอร์มสำหรับคีย์บอร์ด/โปรแกรมอ่านหน้าจอ/เปิดแท็บใหม่
                    <tr key={r.id} className="krok-rep-row" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) return; router.push(`/submission/${r.id}?from=reports`); }}
                      style={{ borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
                      <td style={td}>{fmtWhen(r.when)}</td>
                      <td style={td}><a href={`/submission/${r.id}?from=reports`} style={{ color: "inherit", textDecoration: "none" }}><InlineFormIcon value={r.icon} size={15} />{r.form}</a></td>
                      <td style={td}>{r.user}</td>
                      <td style={td}>
                        {r.result === "fail"
                          ? r.closed ? <Pill kind="na">{t("rep.failClosedShort")}</Pill> : <Pill kind="fail">{t("rep.fail")}</Pill>
                          : <Pill kind="pass">{t("rep.pass")}</Pill>}
                      </td>
                      <td style={td}>{r.approval === "none" ? "-" : approvalLabel(r.approval)}</td>
                      <td style={{ ...td, textAlign: "right", color: r.failCount && !r.closed ? "var(--fail-text)" : "var(--ink-3)" }}>{r.failCount || "-"}</td>
                      <td style={{ ...td, color: "var(--ink-3)", paddingLeft: 0 }} aria-hidden><Icon icon={ChevronRight} className="h-4 w-4" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.total > preview.rows.length && (
              <div style={{ marginTop: 12, textAlign: "center" }}>
                <Button onClick={loadMore} disabled={more}>{more ? t("rep.searching") : tt("rep.loadMore", { n: (preview.total - preview.rows.length).toLocaleString() })}</Button>
              </div>
            )}
            <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "10px 0 0" }}>{t("report.hint")}</p>
            <style>{`.krok-rep-row:hover{background:var(--surface-2)}
              .krok-rep-cards{display:none !important}
              @media(max-width:640px){ .krok-rep-cards{display:grid !important} .krok-rep-table{display:none} }`}</style>
          </Card>
        )
        }</div>
      )}
      </>)}
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
  width: "100%", minHeight: 44, padding: "9px 11px", borderRadius: 10, fontFamily: "inherit", fontSize: ".88rem",
  border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)",
};
const dateLabel: React.CSSProperties = { fontSize: ".78rem", color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 3 };
const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", verticalAlign: "top" };
