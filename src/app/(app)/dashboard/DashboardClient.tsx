"use client";
import { localizeServerMsg } from "@/i18n/stored-text";
import ComplianceCard from "./ComplianceCard";
import StoredText from "@/i18n/StoredText";
import { backdropClose } from "@/lib/backdrop";
import FormIcon, { InlineFormIcon } from "@/components/FormIcon";
import { Fragment, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import AttentionStrip, { AttentionSkeleton } from "./AttentionStrip";
import type { AttentionData } from "@/lib/dashboard-attention";
import { createClient } from "@/lib/supabase/client";
import { Card, Pill } from "@/components/ui";
import Icon from "@/components/Icon";
import Link from "next/link";
import {
  Check, Clock, X, Plus, Pencil, Trash2, GripVertical,
  TrendingUp, Hash, Trophy, FileText, Users, Zap,
  ChevronUp, ChevronDown, MapPin, Settings2, Smartphone,
} from "lucide-react";
import { confirmDialog } from "@/components/dialogs";
import { AreaPicker, AreaSubtitle, AreaView, AreaWidgetTitle } from "./AreaWidget";
import { answerPhotoKeys } from "@/lib/photo-slots";
import { useT } from "@/i18n/LanguageProvider";
import type { MessageKey } from "@/i18n/dictionaries";
import {
  WIDGET_FORMATS, WIDGET_METRICS, RANGES_BY_FORMAT,
  formatLabel, formatHint, metricLabel, rangeLabel, metricUnit, DEFAULT_DASH_SECTIONS,
  type DashSectionKey, type DashWidget, type WidgetFormat, type WidgetMetric, type WidgetRange,
} from "@/lib/dashboard-meta";
import { saveDashboardLayout, saveWorkspaceDashboard, computeWidgets, type WidgetResult } from "./actions";

// รวมคำขอของทุก widget ที่ขอพร้อมกันเป็นการเรียก server ครั้งเดียว
let widgetQueue: { w: DashWidget; resolve: (r: WidgetResult) => void }[] = [];
function loadWidget(w: DashWidget): Promise<WidgetResult> {
  return new Promise((resolve) => {
    widgetQueue.push({ w, resolve });
    if (widgetQueue.length === 1) setTimeout(flushWidgets, 0);
  });
}
async function flushWidgets() {
  const batch = widgetQueue;
  widgetQueue = [];
  try {
    const rs = await computeWidgets(batch.map((b) => b.w));
    batch.forEach((b, i) => b.resolve(rs[i] ?? { error: "คำนวณไม่สำเร็จ" }));
  } catch {
    batch.forEach((b) => b.resolve({ error: "คำนวณไม่สำเร็จ" }));
  }
}
import { type AnswerItem } from "@/lib/answer-item";
export type { AnswerItem };


export interface SubRow {
  id: string; form_title: string; form_icon: string; user_name: string;
  result: "pass" | "fail"; fails: string[];
  /** ไม่มี = ยังไม่ได้โหลด (หน้าต่างรายละเอียดโหลดเองตอนเปิด) */
  answers?: AnswerItem[];
  duration_s: number | null; submitted_at: string;
  approval_status?: "none" | "pending" | "approved" | "rejected";
}
// realtime ส่งเฉพาะคอลัมน์ที่รายการใช้ (ไม่ส่งคำตอบทั้งฟอร์มทุกครั้งที่มีคนส่ง) — คำตอบโหลดตอนเปิดดูรายละเอียด
const LIVE_COLS = ["id", "form_title", "form_icon", "user_name", "result", "fails", "duration_s", "submitted_at", "approval_status"];
export interface FormOpt { id: string; title: string; icon: string }
export interface AreaOpt { id: string; code: string; name: string }
export interface Summary {
  forms: { used: number; max: number };
  members: { used: number; max: number };
  ai: { used: number; max: number };
  period: string;
}

type TTFn = (k: MessageKey, vars?: Record<string, string | number>) => string;

function fmt(ts: string, lang: string) {
  try {
    return new Date(ts).toLocaleString(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}
function fmtValue(metric: WidgetMetric, v: number, en: boolean, tt: TTFn): string {
  if (metric === "avgtime") {
    if (v >= 60) { const m = Math.floor(v / 60), s = v % 60; return tt("dash.durMinSec", { m, s }); }
    return tt("dash.durSec", { s: v });
  }
  const u = metricUnit(metric, en);
  return `${v.toLocaleString()}${u ? (metric === "passrate" ? u : " " + u) : ""}`;
}

export default function DashboardClient({
  tenantId, initial, forms, summary, initialWidgets, hasSchedules = false, areas = [],
  workspaceWidgets = [], workspaceReady = false, isWsAdmin = false, seesAllForms = false,
  attention, sections = DEFAULT_DASH_SECTIONS, canFill = false,
}: {
  /** มีสิทธิ์เมนูกรอกฟอร์ม → ปุ่มหลักของหน้า = "เริ่มกรอกฟอร์ม" (งานจริง) แทน "เพิ่มการ์ด" */
  canFill?: boolean;
  tenantId: string; initial: SubRow[]; forms: FormOpt[]; summary: Summary; initialWidgets: DashWidget[];
  /** พื้นที่ที่เปิดใช้ (widget "ตามพื้นที่") */
  areas?: AreaOpt[];
  /** dashboard ของ workspace (0073) — owner/admin จัด สมาชิกทุกคนเห็น */
  workspaceWidgets?: DashWidget[];
  /** รัน 0073 แล้ว (ยังไม่รัน = แท็บ Workspace แก้ไม่ได้) */
  workspaceReady?: boolean;
  isWsAdmin?: boolean;
  /** เห็นทุกฟอร์มของ workspace (ผู้จัดการ) — ไม่ใช่ = ตัวเลขนับเฉพาะฟอร์มที่ตัวเองมีสิทธิ์ */
  seesAllForms?: boolean;
  /** มีรอบตรวจตามตาราง — ไม่มี = ไม่แสดง/ไม่โหลดการ์ด compliance */
  hasSchedules?: boolean;
  /** แถบ "ต้องดูตอนนี้" (server คำนวณ ส่ง promise มา — แสดงตามมาโดยไม่ถ่วงหน้า) */
  attention?: Promise<AttentionData>;
  /** ลำดับส่วนของหน้า (ไม่ส่ง = ลำดับตั้งต้น) — เผื่อให้จัดเองภายหลัง */
  sections?: readonly DashSectionKey[];
}) {
  const { t, tt, lang } = useT();
  const en = lang === "en";
  const [subs, setSubs] = useState<SubRow[]>(initial);
  const [open, setOpen] = useState<SubRow | null>(null);
  const [mine, setMine] = useState<DashWidget[]>(initialWidgets);
  const [ws, setWs] = useState<DashWidget[]>(workspaceWidgets);
  // เปิดที่ dashboard ของ workspace เป็นหลัก · ยังไม่มีอะไรเลยแต่มีของตัวเอง = เปิดของฉัน
  const [tab, setTab] = useState<"ws" | "mine">(workspaceWidgets.length || !initialWidgets.length ? "ws" : "mine");
  const [saveErr, setSaveErr] = useState("");
  const widgets = tab === "ws" ? ws : mine;
  const canEdit = tab === "mine" || (isWsAdmin && workspaceReady);
  // widget ที่ผูกกับฟอร์มที่ผู้ใช้มองไม่เห็น → ซ่อน (ไม่เผยแม้แต่ชื่อฟอร์ม) · ผู้จัดการเห็นครบ
  const formIds = useMemo(() => new Set(forms.map((f) => f.id)), [forms]);
  const shown = useMemo(
    () => (seesAllForms ? widgets : widgets.filter((w) => w.format === "area" || w.format === "ranking" || !w.formId || w.formId === "all" || formIds.has(w.formId))),
    [widgets, seesAllForms, formIds]
  );
  const [builder, setBuilder] = useState<DashWidget | null>(null); // widget กำลังสร้าง/แก้
  const [dragId, setDragId] = useState<string | null>(null);
  // โหมดจัดการการ์ด: ปุ่มเลื่อน/แก้/ลบ โผล่เฉพาะตอนเปิด (ปกติดูอย่างเดียว ไม่เสี่ยงกดลบพลาด)
  const [managing, setManaging] = useState(false);
  const editing = canEdit && managing;
  // "เพิ่มการ์ด" = งานจัดหน้า (ทำครั้งเดียว) → อยู่ในโหมดจัดการ / ตอนยังว่าง ไม่ใช่ปุ่มหลักของหน้า
  const addCardBtn = (
    <button type="button" data-tour="dash-add" onClick={() => setBuilder({ id: Math.random().toString(36).slice(2), format: "stat", formId: "all", metric: "usage", range: "7d" })}
      className="inline-flex items-center gap-1.5"
      style={{ minHeight: 40, padding: "6px 14px", borderRadius: 8, border: "1px solid var(--line-strong)", background: "var(--surface)", color: "var(--accent-text)", cursor: "pointer", fontFamily: "inherit", fontSize: ".86rem", fontWeight: 600 }}>
      <Icon icon={Plus} className="h-4 w-4" /> {t("dash.addWidget")}
    </button>
  );

  const formName = useMemo(() => {
    const m = new Map(forms.map((f) => [f.id, f.title]));
    return (id: string) => (id === "all" ? t("report.allForms") : m.get(id) || t("dash.deletedForm"));
  }, [forms, t]);
  const areaName = useMemo(() => {
    const m = new Map(areas.map((a) => [a.id, a.name]));
    return (id: string) => (id === "all" ? null : m.get(id) ?? "");
  }, [areas]);

  function persist(next: DashWidget[]) {
    setSaveErr("");
    if (tab === "ws") {
      if (!canEdit) return;
      setWs(next);
      saveWorkspaceDashboard(next).then((r) => { if ("error" in r) setSaveErr(r.error); });
    } else {
      setMine(next);
      saveDashboardLayout(next); // best-effort เก็บลง DB
    }
  }
  function upsertWidget(w: DashWidget) {
    const exists = widgets.some((x) => x.id === w.id);
    persist(exists ? widgets.map((x) => (x.id === w.id ? w : x)) : [...widgets, w]);
    setBuilder(null);
  }
  async function removeWidget(id: string) {
    if (!(await confirmDialog({ message: t("dash.removeConfirm"), confirmLabel: t("common.delete" as never), danger: true }))) return;
    persist(widgets.filter((x) => x.id !== id));
  }
  /** ปุ่มเลื่อนขึ้น/ลง — ทางเลือกของการลาก (มือถือ/จอสัมผัส/คีย์บอร์ดลากไม่ได้) */
  function move(id: string, dir: -1 | 1) {
    // สลับกับ widget ข้าง ๆ ที่ "มองเห็น" (บางตัวถูกซ่อนเพราะผูกฟอร์มที่ไม่มีสิทธิ์)
    const k = shown.findIndex((x) => x.id === id);
    const other = shown[k + dir];
    if (k < 0 || !other) return;
    const i = widgets.findIndex((x) => x.id === id);
    const j = widgets.findIndex((x) => x.id === other.id);
    const next = [...widgets];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  }
  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = widgets.filter((x) => x.id !== dragId);
    const moved = widgets.find((x) => x.id === dragId)!;
    const idx = next.findIndex((x) => x.id === targetId);
    next.splice(idx, 0, moved);
    persist(next);
    setDragId(null);
  }

  // realtime — รายการล่าสุด (คงเดิม)
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("krok-subs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "submissions", filter: `tenant_id=eq.${tenantId}`, select: LIVE_COLS },
        (payload) => { const row = payload.new as SubRow; setSubs((prev) => (prev.some((s) => s.id === row.id) ? prev : [row, ...prev].slice(0, 100))); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "submissions", filter: `tenant_id=eq.${tenantId}`, select: LIVE_COLS },
        (payload) => { const row = payload.new as SubRow; setSubs((prev) => prev.map((s) => (s.id === row.id ? { ...s, ...row } : s))); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId]);

  // ---- ส่วนของหน้า (เรียงตาม sections · ภายหลังให้ workspace จัดลำดับเองได้โดยส่ง sections มา) ----
  function renderSection(key: DashSectionKey): ReactNode {
    switch (key) {
      case "attention":
        // ต้องดูตอนนี้: ใบไม่ผ่านวันนี้ · รอบตรวจเลยกำหนด · รออนุมัติ (คำนวณฝั่ง server)
        return attention ? <Suspense key={key} fallback={<AttentionSkeleton />}><AttentionStrip data={attention} /></Suspense> : null;
      case "compliance":
        // รอบตรวจตามตาราง — ความครบถ้วน (มีตารางเท่านั้น)
        return hasSchedules ? <ComplianceCard key={key} /> : null;
      case "widgets":
        return (
          <Fragment key={key}>
            {/* Workspace (owner/admin จัด) / ของฉัน */}
            <div role="tablist" aria-label={t("dash.title")} className="krok-tabscroll" style={{ display: "flex", gap: 4, boxShadow: "inset 0 -1px 0 var(--line)", marginBottom: 14, overflowX: "auto" }}>
              {(["ws", "mine"] as const).map((k) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setSaveErr(""); setManaging(false); }}
                  style={{ padding: "8px 14px", border: "none", background: "none", borderBottom: `2px solid ${tab === k ? "var(--accent)" : "transparent"}`,
                    color: tab === k ? "var(--accent-text)" : "var(--ink-2)", fontWeight: tab === k ? 600 : 500, fontFamily: "inherit", fontSize: ".92rem", cursor: "pointer", whiteSpace: "nowrap" }}>
                  {k === "ws" ? t("dash.tabWorkspace") : t("dash.tabMine")}
                </button>
              ))}
            </div>
            {!seesAllForms && <p style={{ color: "var(--ink-3)", fontSize: ".8rem", margin: "-6px 0 12px" }}>{t("dash.scopeNote")}</p>}
            {tab === "ws" && isWsAdmin && !workspaceReady && <p style={{ color: "var(--warn)", fontSize: ".82rem", margin: "0 0 12px" }}>{t("dash.wsNotReady")}</p>}
            {saveErr && <p role="alert" style={{ color: "var(--fail)", fontSize: ".82rem", margin: "0 0 12px" }}><StoredErr text={saveErr} /></p>}

            {/* โซน widget ปรับเองได้ */}
            {shown.length === 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "0 0 18px" }}>
                <p style={{ color: "var(--ink-3)", fontSize: ".88rem", margin: 0, flex: "1 1 260px" }}>
                  {tab === "mine" ? t("dash.mineEmpty") : canEdit ? t("dash.wsEmptyAdmin") : t("dash.wsEmptyMember")}
                </p>
                {canEdit && addCardBtn}
              </div>
            )}
            {shown.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 0 10px", flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: "1.1rem", margin: 0 }}>{t("dash.widgets")}</h2>
                  {canEdit && (
                    <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
                    {managing && addCardBtn}
                    <button type="button" onClick={() => setManaging((v) => !v)} aria-pressed={managing}
                      className="inline-flex items-center gap-1.5"
                      style={{ minHeight: 40, padding: "6px 14px", borderRadius: 8, border: `1px solid ${managing ? "var(--accent)" : "var(--line-strong)"}`, background: managing ? "var(--accent)" : "var(--surface)", color: managing ? "var(--accent-ink)" : "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", fontSize: ".86rem", fontWeight: 600 }}>
                      {managing ? <><Icon icon={Check} className="h-4 w-4" /> {t("dash.manageDone")}</> : <><Icon icon={Settings2} className="h-4 w-4" /> {t("dash.manage")}</>}
                    </button>
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 12, marginBottom: 18 }}>
                  {shown.map((w, i) => (
                    <div key={`${tab}:${w.id}`} style={{ minWidth: 0 }} draggable={editing} onDragStart={() => editing && setDragId(w.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => editing && onDrop(w.id)}>
                      <WidgetCard w={w} formName={formName} areaName={areaName} en={en} t={t} editing={editing}
                        onEdit={editing ? () => setBuilder(w) : undefined} onRemove={editing ? () => void removeWidget(w.id) : undefined}
                        onUp={editing && i > 0 ? () => move(w.id, -1) : undefined}
                        onDown={editing && i < shown.length - 1 ? () => move(w.id, 1) : undefined} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </Fragment>
        );
      case "usage":
        // โควตาแพ็กเกจของ workspace (ตายตัว 3 การ์ด) — ไว้ล่างสุด เห็นเฉพาะ owner/admin
        return isWsAdmin ? (
          <section key={key} aria-labelledby="dash-usage-h" style={{ marginTop: 18 }}>
            <h2 id="dash-usage-h" style={{ fontSize: "1.1rem", margin: "0 0 10px" }}>{t("dash.usageTitle")}</h2>
            <div data-tour="dash-summary" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }} className="krok-sumcards">
              <SummaryCard icon={FileText} label={t("dash.sumForms")} used={summary.forms.used} max={summary.forms.max} />
              <SummaryCard icon={Users} label={t("dash.sumMembers")} used={summary.members.used} max={summary.members.max} />
              <SummaryCard icon={Zap} label={t("dash.sumAi")} used={summary.ai.used} max={summary.ai.max} sub={summary.period} />
            </div>
          </section>
        ) : null;
      case "latest":
        return null; // ยังเขียน inline ด้านล่าง (ตำแหน่งคงที่ระหว่างส่วนก่อน/หลัง)
    }
  }
  // "รายการล่าสุด" ยังเป็น JSX inline — แบ่งส่วนอื่นเป็นก่อน/หลังมัน
  const latestAt = sections.indexOf("latest");
  const before = latestAt < 0 ? sections : sections.slice(0, latestAt);
  const after = latestAt < 0 ? [] : sections.slice(latestAt + 1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.4rem", margin: 0 }}>{t("dash.title")}</h1>
        {canFill && (
          <Link href="/forms" className="inline-flex items-center gap-1.5"
            style={{ minHeight: 44, padding: "10px 18px", borderRadius: 10, background: "var(--accent)", color: "var(--accent-ink)", fontSize: ".95rem", fontWeight: 600, textDecoration: "none" }}>
            <Icon icon={Smartphone} className="h-[18px] w-[18px]" /> {t("dash.startFill")}
          </Link>
        )}
      </div>

      {before.map(renderSection)}

      {/* รายการล่าสุด (คงเดิม) */}
      <Card>
        <h2 data-tour="dash-latest" style={{ fontSize: "1.15rem", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--pass)" }} />
          {t("dash.latest")}
        </h2>
        <p style={{ color: "var(--ink-2)", fontSize: ".9rem", marginTop: 0 }}>{t("dash.latestSub")}</p>
        <div>
          {subs.length === 0 && <span style={{ color: "var(--ink-3)" }}>{t("dash.empty")}</span>}
          {subs.map((s) => (
            // เปิดรายละเอียดใน popup — role=button + Enter/Space ให้ใช้คีย์บอร์ดได้
            <div key={s.id} role="button" tabIndex={0} onClick={() => setOpen(s)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(s); } }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
              <FormIcon value={s.form_icon} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: ".93rem" }}>{s.form_title}</b>
                <small style={{ display: "block", color: "var(--ink-3)", fontSize: ".76rem" }}>{s.user_name || "—"} · {fmt(s.submitted_at, lang)}</small>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {s.approval_status === "pending" && <Pill kind="na"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={Clock} className="h-3 w-3" /> {t("dash.pending")}</span></Pill>}
                {s.approval_status === "approved" && <Pill kind="pass">{t("dash.approved")}</Pill>}
                {s.approval_status === "rejected" && <Pill kind="fail">{t("dash.rejected")}</Pill>}
                {s.fails?.length ? <Pill kind="fail"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={X} className="h-3 w-3" /> {tt("dash.failN", { n: s.fails.length })}</span></Pill> : s.result === "pass" ? <Pill kind="pass"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={Check} className="h-3 w-3" /> {t("dash.passed")}</span></Pill> : <Pill kind="na">{t("dash.submitted")}</Pill>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {after.map(renderSection)}

      {open && <DetailModal sub={open} tenantId={tenantId} onClose={() => setOpen(null)} />}
      {builder && (
        <WidgetBuilder initial={builder} forms={forms} areas={areas} en={en} t={t}
          onCancel={() => setBuilder(null)} onSave={upsertWidget} />
      )}

      <style>{`@media(max-width:700px){.krok-sumcards{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}

// ---------- การ์ดสรุป (มี progress) ----------
function SummaryCard({ icon, label, used, max, sub }: { icon: typeof FileText; label: string; used: number; max: number; sub?: string }) {
  const unlimited = max >= 999999;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const over = !unlimited && used >= max;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--ink-3)", fontSize: ".78rem" }}>
        <Icon icon={icon} className="h-4 w-4" /> {label}{sub ? ` · ${sub}` : ""}
      </div>
      <div className="tabnum" style={{ fontFamily: "var(--font-anuphan)", fontWeight: 700, margin: "6px 0 8px" }}>
        <span style={{ fontSize: "1.7rem", color: over ? "var(--fail)" : "var(--ink)" }}>{used.toLocaleString()}</span>
        <span style={{ fontSize: "1rem", color: "var(--ink-3)" }}> / {unlimited ? "∞" : max.toLocaleString()}</span>
      </div>
      <div style={{ height: 7, borderRadius: 6, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ width: unlimited ? "8%" : `${pct}%`, height: "100%", background: over ? "var(--fail)" : "var(--accent)", borderRadius: 6, transition: "width .3s" }} />
      </div>
    </div>
  );
}

// ---------- การ์ด widget ----------
type TFn = (k: never) => string;
function WidgetCard({ w, formName, areaName, en, editing = false, onEdit, onRemove, onUp, onDown, t }: {
  /** โหมดจัดการการ์ด: แถบปุ่มเลื่อน/แก้/ลบ ขนาดนิ้วกดได้ (44px) ใต้หัวการ์ด */
  editing?: boolean;
  w: DashWidget; formName: (id: string) => string; areaName: (id: string) => string | null; en: boolean;
  /** ไม่มี = ดูอย่างเดียว (dashboard ของ workspace สำหรับสมาชิก) */
  onEdit?: () => void; onRemove?: () => void; onUp?: () => void; onDown?: () => void; t: TFn;
}) {
  const [res, setRes] = useState<WidgetResult | null>(null);
  const [attempt, setAttempt] = useState(0); // กด "ลองใหม่" → คำนวณการ์ดนี้ใหม่
  const key = `${w.format}|${w.formId}|${w.metric}|${w.range}`;
  useEffect(() => {
    let active = true;
    setRes(null);
    loadWidget(w).then((r) => { if (active) setRes(r); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const isArea = w.format === "area";
  const fIcon = isArea ? MapPin : w.format === "stat" ? Hash : w.format === "trend" ? TrendingUp : Trophy;
  const sub = isArea ? <AreaSubtitle name={areaName(w.formId)} /> : `${formName(w.formId)} · ${rangeLabel(w.range, en)}`;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, height: "100%", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        {onEdit && <span aria-hidden style={{ color: "var(--ink-3)", cursor: "grab", marginTop: 2 }}><Icon icon={GripVertical} className="h-4 w-4" /></span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: ".9rem", fontWeight: 600 }}>
            <Icon icon={fIcon} className="h-4 w-4" /> {isArea ? <AreaWidgetTitle /> : metricLabel(w.metric, en)}
          </div>
          <div style={{ color: "var(--ink-3)", fontSize: ".74rem", marginTop: 1, overflowWrap: "anywhere" }}>{sub}</div>
        </div>
      </div>
      {editing && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          {/* ปุ่มที่ใช้ไม่ได้ (ใบแรก/ใบสุดท้าย) ซ่อนไว้แต่คงที่ว่าง — ปุ่มไม่กระโดดตำแหน่ง */}
          <button onClick={onUp} disabled={!onUp} title={t("dash.moveUp" as never)} aria-label={t("dash.moveUp" as never)} style={{ ...iconBtn, visibility: onUp ? "visible" : "hidden" }}><Icon icon={ChevronUp} className="h-5 w-5" /></button>
          <button onClick={onDown} disabled={!onDown} title={t("dash.moveDown" as never)} aria-label={t("dash.moveDown" as never)} style={{ ...iconBtn, visibility: onDown ? "visible" : "hidden" }}><Icon icon={ChevronDown} className="h-5 w-5" /></button>
          <span style={{ flex: 1 }} />
          {onEdit && <button onClick={onEdit} title={t("common.edit" as never)} aria-label={t("common.edit" as never)} style={iconBtn}><Icon icon={Pencil} className="h-[18px] w-[18px]" /></button>}
          {onRemove && <button onClick={onRemove} title={t("common.delete" as never)} aria-label={t("common.delete" as never)} style={{ ...iconBtn, color: "var(--fail-text)" }}><Icon icon={Trash2} className="h-[18px] w-[18px]" /></button>}
        </div>
      )}

      <div style={{ marginTop: 12, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
        {res == null && <div style={{ color: "var(--ink-3)", fontSize: ".82rem" }}>{t("common.loading" as never)}</div>}
        {res && "error" in res && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", color: "var(--fail-text)", fontSize: ".82rem" }}>
            <StoredErr text={res.error} />
            <button type="button" onClick={() => setAttempt((n) => n + 1)} style={{ minHeight: 44, padding: "0 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", color: "var(--accent-text)", fontWeight: 600, fontFamily: "inherit", fontSize: ".82rem", cursor: "pointer" }}>{t("common.retry" as never)}</button>
          </div>
        )}
        {res && !("error" in res) && (
          <>
            {res.kind === "stat" && <StatView res={res} metric={w.metric} en={en} />}
            {res.kind === "trend" && <TrendView res={res} metric={w.metric} en={en} />}
            {res.kind === "ranking" && <RankingView res={res} metric={w.metric} en={en} />}
            {res.kind === "area" && <AreaView items={res.items} grouped={w.formId === "all"} />}
          </>
        )}
      </div>
    </div>
  );
}
const iconBtn: React.CSSProperties = {
  width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
  border: "1px solid var(--line-strong)", background: "var(--surface)", borderRadius: 10, cursor: "pointer", color: "var(--ink-2)", flexShrink: 0,
};

function StatView({ res, metric, en }: { res: Extract<WidgetResult, { kind: "stat" }>; metric: WidgetMetric; en: boolean }) {
  const { tt } = useT();
  const extra = metric === "passrate" && res.pass != null
    ? tt("dash.passFail", { pass: res.pass, fail: res.fail ?? 0 })
    : "";
  return (
    <div>
      <div className="tabnum" style={{ fontFamily: "var(--font-anuphan)", fontSize: "2.1rem", fontWeight: 800, lineHeight: 1.1, color: "var(--ink)", overflowWrap: "anywhere" }}>
        {fmtValue(metric, res.value, en, tt)}
      </div>
      {extra && <div style={{ color: "var(--ink-3)", fontSize: ".78rem", marginTop: 4 }}>{extra}</div>}
    </div>
  );
}

function TrendView({ res, metric, en }: { res: Extract<WidgetResult, { kind: "trend" }>; metric: WidgetMetric; en: boolean }) {
  const { tt } = useT();
  const series = res.series;
  const max = Math.max(1, ...series.map((s) => s.v));
  return (
    <div>
      <div className="tabnum" style={{ fontFamily: "var(--font-anuphan)", fontSize: "1.5rem", fontWeight: 700, marginBottom: 8 }}>
        {fmtValue(metric, res.total, en, tt)}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: series.length > 14 ? 2 : 4, height: 72 }}>
        {series.map((s) => (
          <div key={s.key} title={`${s.key.slice(5)} · ${s.v}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ height: `${Math.round((s.v / max) * 100)}%`, minHeight: s.v > 0 ? 3 : 0, background: "var(--accent)", borderRadius: 3, opacity: 0.85 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-3)", fontSize: ".68rem", marginTop: 4 }}>
        <span>{series[0]?.key.slice(5)}</span>
        <span>{series[series.length - 1]?.key.slice(5)}</span>
      </div>
    </div>
  );
}

function RankingView({ res, metric, en }: { res: Extract<WidgetResult, { kind: "ranking" }>; metric: WidgetMetric; en: boolean }) {
  const { t, tt } = useT();
  const items = res.items;
  const max = Math.max(1, ...items.map((r) => r.v));
  if (items.length === 0) return <div style={{ color: "var(--ink-3)", fontSize: ".82rem" }}>{t("common.none")}</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 18, textAlign: "right", color: "var(--ink-3)", fontSize: ".78rem" }}>{i + 1}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: ".84rem", minWidth: 0 }}>
              <b title={r.title} style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><InlineFormIcon value={r.icon} size={15} />{r.title}</b>
              <span className="tabnum" style={{ color: "var(--ink-2)", flexShrink: 0 }}>{fmtValue(metric, r.v, en, tt)}</span>
            </span>
            <span style={{ display: "block", height: 5, borderRadius: 4, background: "var(--surface-2)", marginTop: 3, overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${Math.round((r.v / max) * 100)}%`, background: "var(--accent)", borderRadius: 4 }} />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- ตัวสร้าง/แก้ widget ----------
function WidgetBuilder({ initial, forms, areas, en, t, onCancel, onSave }: {
  initial: DashWidget; forms: FormOpt[]; areas: AreaOpt[]; en: boolean; t: TFn;
  onCancel: () => void; onSave: (w: DashWidget) => void;
}) {
  const [format, setFormat] = useState<WidgetFormat>(initial.format);
  const [formId, setFormId] = useState<string>(initial.formId);
  const [metric, setMetric] = useState<WidgetMetric>(initial.metric);
  const [range, setRange] = useState<WidgetRange>(initial.range);

  const ranges = RANGES_BY_FORMAT[format];
  const effRange = ranges.includes(range) ? range : ranges[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div {...backdropClose(onCancel)} role="dialog" aria-modal="true" aria-label={t("dash.widgetBuilder" as never)}
      style={{ position: "fixed", inset: 0, background: "rgba(10,14,18,.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, maxWidth: 480, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <h2 style={{ fontSize: "1.15rem", marginBottom: 12 }}>{t("dash.widgetBuilder" as never)}</h2>

        {/* 1. รูปแบบ */}
        <Section n={1} label={t("dash.stepFormat" as never)} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
          {WIDGET_FORMATS.map((f) => (
            <button key={f} onClick={() => setFormat(f)}
              style={pickBtn(format === f)}>
              <b style={{ fontSize: ".86rem", fontFamily: "var(--font-anuphan)" }}>{formatLabel(f, en)}</b>
              <span style={{ display: "block", color: "var(--ink-3)", fontSize: ".7rem", marginTop: 2 }}>{formatHint(f, en)}</span>
            </button>
          ))}
        </div>

        {/* ตามพื้นที่: เลือกพื้นที่อย่างเดียว (ไม่มีค่า/ช่วงเวลา — แสดงใบที่ยังไม่จบ ณ ตอนนี้) */}
        {format === "area" && <AreaPicker areas={areas} value={formId} onChange={setFormId} />}

        {/* 2. ฟอร์ม (ranking = ทุกฟอร์มเสมอ) */}
        {format !== "ranking" && format !== "area" && (
          <>
            <Section n={2} label={t("dash.stepForm" as never)} />
            <select value={formId} onChange={(e) => setFormId(e.target.value)} style={selStyle}>
              <option value="all">{t("report.allForms" as never)}</option>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </>
        )}

        {format !== "area" && <>
        {/* 3. ค่าที่แสดง */}
        <Section n={format === "ranking" ? 2 : 3} label={t("dash.stepMetric" as never)} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {WIDGET_METRICS.map((m) => (
            <button key={m} onClick={() => setMetric(m)} style={chip(metric === m)}>{metricLabel(m, en)}</button>
          ))}
        </div>

        {/* 4. ช่วงเวลา */}
        <Section n={format === "ranking" ? 3 : 4} label={t("dash.stepRange" as never)} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ranges.map((r) => (
            <button key={r} onClick={() => setRange(r)} style={chip(effRange === r)}>{rangeLabel(r, en)}</button>
          ))}
        </div>
        </>}

        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          <button onClick={() => onSave(format === "area"
              ? { id: initial.id, format, formId: areas.some((a) => a.id === formId) ? formId : "all", metric: "usage", range: "all" }
              : { id: initial.id, format, formId: format === "ranking" ? "all" : formId, metric, range: effRange })}
            style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-ink)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
            {t("common.save" as never)}
          </button>
          <button onClick={onCancel}
            style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" }}>
            {t("common.cancel" as never)}
          </button>
        </div>
      </div>
    </div>
  );
}
function Section({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 8px" }}>
      <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent-text)", fontSize: ".76rem", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
      <b style={{ fontSize: ".9rem" }}>{label}</b>
    </div>
  );
}
const selStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", borderRadius: 10, fontFamily: "inherit", fontSize: ".9rem",
  border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)",
};
function pickBtn(on: boolean): React.CSSProperties {
  return {
    textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
    border: on ? "2px solid var(--accent)" : "1px solid var(--line)",
    background: on ? "var(--accent-soft)" : "var(--surface)", color: "var(--ink)",
  };
}
function chip(on: boolean): React.CSSProperties {
  return {
    padding: "7px 12px", borderRadius: 20, fontSize: ".82rem", cursor: "pointer", fontFamily: "inherit",
    border: on ? "1px solid var(--accent)" : "1px solid var(--line)",
    background: on ? "var(--accent-soft)" : "var(--surface)",
    color: on ? "var(--accent-text)" : "var(--ink-2)", fontWeight: on ? 600 : 500,
  };
}

// ---------- Detail modal (คงเดิม) ----------
function DetailModal({ sub, tenantId, onClose }: { sub: SubRow; tenantId: string; onClose: () => void }) {
  const { t, tt, lang } = useT();
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState<AnswerItem[] | null>(null);
  const answers = sub.answers ?? loaded;

  // คำตอบ + รูป: ดึงพร้อมกัน แล้วขอ signed URL ครั้งเดียวทั้งชุด
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [ansRes, { data }] = await Promise.all([
        sub.answers ? Promise.resolve(null) : supabase.from("submissions").select("answers").eq("id", sub.id).maybeSingle(),
        supabase.from("submission_photos").select("field_id, storage_path").eq("submission_id", sub.id),
      ]);
      if (cancelled) return;
      if (ansRes) setLoaded(((ansRes.data?.answers as AnswerItem[]) ?? []));
      if (!data?.length) return;
      const { data: signed } = await supabase.storage.from("submissions").createSignedUrls(data.map((p) => p.storage_path as string), 3600);
      const urlOf = new Map((signed || []).map((x) => [x.path, x.signedUrl]));
      const out: Record<string, string> = {};
      for (const p of data) { const u = urlOf.get(p.storage_path as string); if (u) out[p.field_id as string] = u; }
      if (!cancelled) setPhotos(out);
    })();
    return () => { cancelled = true; };
  }, [sub.id, sub.answers, tenantId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div {...backdropClose(onClose)} role="dialog" aria-modal="true" aria-label={sub.form_title}
      style={{ position: "fixed", inset: 0, background: "rgba(10,14,18,.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }} className="no-print">
      <div style={{ background: "var(--surface)", borderRadius: 16, maxWidth: 640, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: "1.1rem" }}><InlineFormIcon value={sub.form_icon} size={20} />{sub.form_title}</h2>
          {sub.result === "fail" ? <Pill kind="fail"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={X} className="h-3 w-3" /> {t("dash.issues")}</span></Pill> : <Pill kind="pass"><span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon icon={Check} className="h-3 w-3" /> {t("dash.passed")}</span></Pill>}
        </div>
        <p style={{ color: "var(--ink-2)", fontSize: ".85rem", marginTop: 2 }}>
          {t("dash.by")} {sub.user_name || "—"} · {fmt(sub.submitted_at, lang)} · {tt("dash.took", { s: sub.duration_s ?? "–" })}
        </p>
        {answers === null && <div style={{ padding: "16px 0", color: "var(--ink-3)", fontSize: ".88rem" }}>{t("common.loading")}</div>}
        {(answers ?? []).map((a, i) =>
          a.type === "table" && a.columns ? (
            <div key={i} style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ color: "var(--ink-2)", fontSize: ".9rem", marginBottom: 4 }}>{a.label}</div>
              {a.rows && a.rows.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: ".82rem", minWidth: "100%" }}>
                    <thead>
                      <tr>{a.columns.map((c) => <th key={c.id} style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--line)", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{c.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {a.rows.map((r, ri) => (
                        <tr key={ri} style={{ borderBottom: "1px solid var(--line)" }}>
                          {a.columns!.map((c) => {
                            const pk = r[`${c.id}#photo`];
                            return <td key={c.id} style={{ padding: "4px 8px", verticalAlign: "top" }}>{pk && photos[pk] ? <img loading="lazy" src={photos[pk]} alt={`${c.label} ${ri + 1}`} style={{ height: 48, maxWidth: 80, objectFit: "cover", borderRadius: 5 }} /> : (r[c.id] || "—")}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <span style={{ color: "var(--ink-3)", fontSize: ".82rem" }}>—</span>}
            </div>
          ) : (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "2px 14px", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: ".9rem" }}>
              <div style={{ color: "var(--ink-2)" }}>
                {a.label}
                {a.note && <div style={{ color: "var(--fail)", fontSize: ".8rem" }}><StoredText text={a.note} /></div>}
              </div>
              <div style={{ fontWeight: 600, textAlign: "right", overflowWrap: "anywhere", color: a.fail ? "var(--fail)" : a.type === "pass_fail" ? "var(--pass)" : "var(--ink)" }}>
                {a.photoField ? (
                  photos[a.photoField] ? (
                    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {answerPhotoKeys(a).map((k) => photos[k] && <img loading="lazy" key={k} src={photos[k]} alt={t("dash.photoAlt")} style={{ maxHeight: answerPhotoKeys(a).length > 1 ? 72 : 110, borderRadius: 6 }} />)}
                    </span>
                  ) : <span style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>{t("dash.loadingPhoto")}</span>
                ) : (
                  <>
                    {a.display ? <StoredText text={a.display} /> : "—"}
                    {a.code && <span style={{ marginLeft: 6, fontFamily: "monospace", fontSize: ".75rem", fontWeight: 400, color: "var(--ink-3)" }}>{a.code}</span>}
                  </>
                )}
              </div>
            </div>
          )
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <a href={`/submission/${sub.id}`} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-ink)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, textDecoration: "none", fontSize: ".9rem" }}>{t("dash.openDoc")}</a>
          <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" }}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}

/** ข้อความ error จาก server ตามภาษาที่เลือก */
function StoredErr({ text }: { text: string }) {
  const { lang } = useT();
  return <>{localizeServerMsg(text, lang)}</>;
}
